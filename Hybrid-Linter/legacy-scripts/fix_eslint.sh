#!/usr/bin/env bash

# Text formatting
BOLD='\033[1m'
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${BOLD}Running ESLint checks and fixes...${NC}\n"

# Function to fix ESLint issues with Copilot
fix_with_copilot() {
  local file="$1"
  local issues="$2"

  echo -e "${BOLD}Fixing ${BLUE}$file${NC} using Copilot"

  # Create a very specific prompt for Copilot with clear examples
  prompt="Fix these ESLint issues in this TypeScript/React file:

File: $file

ESLint Issues:
$issues

Here are the exact fixes needed:

1. For 'no-unused-vars' errors:
   - Add an underscore prefix to any unused variable
   - Example: Change 'const data' to 'const _data' if data is unused

2. For 'no-explicit-any' errors:
   - Replace 'any' type with 'unknown'
   - Example: Change 'function process(data: any)' to 'function process(data: unknown)'

3. For 'no-useless-escape' errors:
   - Remove unnecessary escape characters
   - Example: Change '\\.' to '.' when not in a regex special context

Current file content:
\`\`\`
$(cat "$file")
\`\`\`

Please return ONLY the complete fixed code with no explanations or markdown. The code should be ready to save directly to a file."

  echo -e "${CYAN}Asking GitHub Copilot for fixes...${NC}"
  suggestion=$(gh copilot suggest -t code "$prompt" 2>/dev/null)

  if [ -n "$suggestion" ]; then
    # Clean up suggestion - remove any markdown code blocks if present
    if [[ "$suggestion" =~ "\`\`\`" ]]; then
      clean_suggestion=$(echo "$suggestion" | sed -n '/```/,/```/p' | sed '1d;$d')
      suggestion="$clean_suggestion"
    fi

    # Check if suggestion is different from original
    if [ "$suggestion" != "$(cat "$file")" ]; then
      echo -e "${GREEN}Copilot suggested fixes. Preview:${NC}"
      diff -u <(cat "$file") <(echo "$suggestion") | head -n 20

      echo -e "\n${YELLOW}Apply these changes? (y/n)${NC}"
      read -r choice

      if [[ $choice == [Yy]* ]]; then
        echo "$suggestion" > "$file"
        echo -e "${GREEN}Applied Copilot's fixes to $file${NC}"
        return 0
      else
        echo -e "${RED}Changes skipped${NC}"
        return 1
      fi
    else
      echo -e "${YELLOW}Copilot didn't suggest any changes${NC}"
      return 1
    fi
  else
    echo -e "${RED}No Copilot suggestion available${NC}"
    return 1
  fi
}

# Function to fix common ESLint issues using patterns
fix_with_patterns() {
  local file="$1"
  local issues="$2"
  local content=$(cat "$file")
  local new_content="$content"
  local fixes_applied=0

  # Fix unused variables
  if [[ "$issues" =~ "no-unused-vars" ]]; then
    echo -e "${YELLOW}Fixing unused variables...${NC}"

    # Extract all unused variables from issues
    unused_vars=()
    while IFS= read -r issue; do
      if [[ "$issue" =~ \'([^\']+)\'.+never\ used ]]; then
        var_name="${BASH_REMATCH[1]}"
        unused_vars+=("$var_name")
      fi
    done < <(echo "$issues" | grep -E "no-unused-vars|@typescript-eslint/no-unused-vars")

    # Remove duplicates
    if [ ${#unused_vars[@]} -gt 0 ]; then
      unused_vars=($(printf "%s\n" "${unused_vars[@]}" | sort -u))
      echo -e "${YELLOW}Found unused variables: ${unused_vars[*]}${NC}"

      # Apply fixes for each variable
      for var in "${unused_vars[@]}"; do
        new_content=$(echo "$new_content" | sed -E "s/\b(const|let|var)\s+($var)\b/\1 _\2/g")
        new_content=$(echo "$new_content" | sed -E "s/\b(function\s+[A-Za-z0-9_]+\([^)]*)(\\b$var\\b)([^)]*\))/\1_\2\3/g")
        new_content=$(echo "$new_content" | sed -E "s/\b(\([^)]*)(\\b$var\\b)([^)]*\)\s*=>)/\1_\2\3/g")
        new_content=$(echo "$new_content" | sed -E "s/\{([^}]*)(\\b$var\\b)([^}]*)\}/\{\1_\2\3\}/g")
      done

      if [ "$new_content" != "$content" ]; then
        fixes_applied=1
      fi
    fi
  fi

  # Fix explicit any types
  if [[ "$issues" =~ "no-explicit-any" ]]; then
    echo -e "${YELLOW}Fixing explicit any types...${NC}"

    # Replace any with unknown
    temp_content=$(echo "$new_content" |
      sed -E 's/: any([,)])/: unknown\1/g' |
      sed -E 's/as any([,);])/as unknown\1/g' |
      sed -E 's/: Array<any>/: Array<unknown>/g' |
      sed -E 's/: any\[\]/: unknown\[\]/g')

    if [ "$temp_content" != "$new_content" ]; then
      new_content="$temp_content"
      fixes_applied=1
    fi
  fi

  # Apply changes if fixes were found
  if [ $fixes_applied -eq 1 ]; then
    echo -e "${GREEN}Found pattern-based fixes${NC}"
    echo -e "${YELLOW}Preview changes:${NC}"
    diff -u <(cat "$file") <(echo "$new_content") | head -n 20

    echo -e "\n${YELLOW}Apply these changes? (y/n)${NC}"
    read -r choice

    if [[ $choice == [Yy]* ]]; then
      echo "$new_content" > "$file"
      echo -e "${GREEN}Applied pattern-based fixes to $file${NC}"
      return 0
    else
      echo -e "${RED}Changes skipped${NC}"
      return 1
    fi
  else
    echo -e "${YELLOW}No pattern-based fixes found${NC}"
    return 1
  fi
}

# Get ESLint issues
echo -e "${BOLD}Checking for ESLint issues...${NC}"
TEMP_FILE=$(mktemp)
npx eslint . --max-warnings=9999 > "$TEMP_FILE"

# Process files with issues
TOTAL_ISSUES=$(grep -c "warning\|error" "$TEMP_FILE" || echo 0)
if [ "$TOTAL_ISSUES" -gt 0 ]; then
  echo -e "${RED}Found $TOTAL_ISSUES ESLint issues.${NC}\n"

  # Get unique files with issues
  files_with_issues=$(grep -E "^/" "$TEMP_FILE" | cut -d':' -f1 | sort -u)

  # Counters
  fixed_files=0
  total_files=0

  for file in $files_with_issues; do
    ((total_files++))
    echo -e "\n${BOLD}Processing ${BLUE}$file${NC} ($total_files of $(echo "$files_with_issues" | wc -l | tr -d ' '))"

    # Get file issues
    file_issues=$(grep -A 1 "$file" "$TEMP_FILE" | grep -E "warning|error")

    # Try Copilot first
    fix_with_copilot "$file" "$file_issues"
    copilot_result=$?

    # If Copilot failed, try pattern-based fixes
    if [ $copilot_result -ne 0 ]; then
      fix_with_patterns "$file" "$file_issues"
      pattern_result=$?

      if [ $pattern_result -eq 0 ]; then
        ((fixed_files++))
      fi
    else
      ((fixed_files++))
    fi
  done

  # Final report
  echo -e "\n${BOLD}ESLint Fix Summary${NC}"
  echo -e "Total files with issues: $total_files"
  echo -e "Files successfully fixed: $fixed_files"

  # Check remaining issues
  remaining_issues=$(npx eslint . --max-warnings=9999 2>/dev/null | grep -c "warning\|error" || echo 0)
  if [ "$remaining_issues" -eq 0 ]; then
    echo -e "${GREEN}All ESLint issues have been fixed!${NC}"
  else
    echo -e "${YELLOW}$remaining_issues issues remain after fixes.${NC}"
  fi
else
  echo -e "${GREEN}No ESLint issues found!${NC}\n"
fi

rm -f "$TEMP_FILE"
echo -e "${BOLD}${GREEN}Done!${NC}"
exit 0
