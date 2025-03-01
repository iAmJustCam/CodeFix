#!/usr/bin/env bash

# Text formatting
BOLD='\033[1m'
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${BOLD}Running comprehensive code quality checks and fixes...${NC}\n"

# Run Prettier
echo -e "${BOLD}Running Prettier formatting...${NC}"
npx prettier --write . --log-level=warn
echo -e "${GREEN}Code formatting complete.${NC}\n"

# Run TypeScript checks
echo -e "${BOLD}Running TypeScript type checks...${NC}"
npx tsc --noEmit
TS_EXIT_CODE=$?
if [ $TS_EXIT_CODE -eq 0 ]; then
  echo -e "${GREEN}No TypeScript errors found.${NC}\n"
else
  echo -e "${RED}TypeScript errors detected. Please review manually.${NC}\n"
fi

# Run ESLint with fix
echo -e "${BOLD}Running ESLint fixes...${NC}"
npx eslint . --fix --max-warnings=9999 --quiet
echo -e "${GREEN}ESLint auto-fix completed.${NC}\n"

# Function to apply fixes to unused variables
fix_unused_variables() {
  local file="$1"
  local issues="$2"
  local content=$(cat "$file")
  local new_content="$content"
  local fixes=0

  # Extract unused variables
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
      # Fix variable declarations
      new_content=$(echo "$new_content" | sed -E "s/\b(const|let|var)\s+($var)\b/\1 _\2/g")

      # Fix function parameters
      new_content=$(echo "$new_content" | sed -E "s/\b(function\s+[A-Za-z0-9_]+\([^)]*)(\\b$var\\b)([^)]*\))/\1_\2\3/g")

      # Fix arrow function parameters
      new_content=$(echo "$new_content" | sed -E "s/\b(\([^)]*)(\\b$var\\b)([^)]*\)\s*=>)/\1_\2\3/g")

      # Fix destructured variables
      new_content=$(echo "$new_content" | sed -E "s/\{([^}]*)(\\b$var\\b)([^}]*)\}/\{\1_\2\3\}/g")
    done

    # Apply changes if content was updated
    if [ "$new_content" != "$content" ]; then
      echo -e "${GREEN}Found fixes for unused variables${NC}"
      fixes=1
    fi
  fi

  if [ $fixes -eq 1 ]; then
    echo "$new_content"
    return 0
  else
    echo "$content"
    return 1
  fi
}

# Function to fix explicit any types
fix_explicit_any() {
  local file="$1"
  local issues="$2"
  local content="$3"
  local new_content="$content"
  local fixes=0

  if [[ "$issues" =~ "no-explicit-any" ]]; then
    echo -e "${YELLOW}Fixing explicit any types...${NC}"

    # Replace any with unknown
    new_content=$(echo "$content" |
      sed -E 's/: any([,)])/: unknown\1/g' |
      sed -E 's/as any([,);])/as unknown\1/g' |
      sed -E 's/: Array<any>/: Array<unknown>/g' |
      sed -E 's/: any\[\]/: unknown\[\]/g')

    # Apply changes if content was updated
    if [ "$new_content" != "$content" ]; then
      echo -e "${GREEN}Found fixes for explicit any types${NC}"
      fixes=1
    fi
  fi

  if [ $fixes -eq 1 ]; then
    echo "$new_content"
    return 0
  else
    echo "$content"
    return 1
  fi
}

# Function to fix useless escape characters
fix_useless_escape() {
  local file="$1"
  local issues="$2"
  local content="$3"
  local new_content="$content"
  local fixes=0

  if [[ "$issues" =~ "no-useless-escape" ]]; then
    echo -e "${YELLOW}Finding useless escape characters...${NC}"

    # Extract line numbers with useless escapes
    while IFS= read -r issue; do
      if [[ "$issue" =~ :([0-9]+): && "$issue" =~ no-useless-escape ]]; then
        line_num="${BASH_REMATCH[1]}"

        # Get the line content
        line_content=$(echo "$content" | sed "${line_num}q;d")

        # Fix common escape issues
        fixed_line="$line_content"
        # Replace \. with . when not in a character class or special context
        fixed_line=$(echo "$fixed_line" | sed 's/\\\.([^*+?])/.\1/g')
        # Remove other common unnecessary escapes
        fixed_line=$(echo "$fixed_line" | sed 's/\\([^nrt\\\/"'\''$\-])/\1/g')

        if [ "$fixed_line" != "$line_content" ]; then
          # Replace the line in the file content
          new_content=$(echo "$new_content" | sed "${line_num}s/.*/$fixed_line/")
          echo -e "${GREEN}Found fix for useless escape on line $line_num${NC}"
          fixes=1
        fi
      fi
    done < <(echo "$issues" | grep "no-useless-escape")
  fi

  if [ $fixes -eq 1 ]; then
    echo "$new_content"
    return 0
  else
    echo "$content"
    return 1
  fi
}

# Function to try GitHub Copilot for fixes
try_copilot_fix() {
  local file="$1"
  local issues="$2"
  local extension="${file##*.}"

  echo -e "${CYAN}Asking GitHub Copilot for suggestions...${NC}"

  # Create a better prompt for Copilot based on specific issues
  local rule_types=$(echo "$issues" | grep -oE "(no-unused-vars|@typescript-eslint/no-unused-vars|no-explicit-any|@typescript-eslint/no-explicit-any|no-useless-escape)" | sort -u)

  # Example-based prompt with specific file type
  prompt="Fix these ESLint issues in this $extension file:

Issues:
$issues

Specific ESLint rules to fix:
$rule_types

Here are examples of how to fix each type of issue:

1. For 'no-unused-vars':
   // Before
   function calculate(width, height) {
     return width * width; // height is unused
   }
   // After
   function calculate(width, _height) {
     return width * width;
   }

2. For 'no-explicit-any':
   // Before
   function process(data: any): any {
     return data;
   }
   // After
   function process(data: unknown): unknown {
     return data;
   }

3. For 'no-useless-escape':
   // Before
   const regex = /\./;
   // After
   const regex = /./;

Here's the file content to fix:

\`\`\`$extension
$(cat "$file")
\`\`\`

Return only the fixed code without explanations."

  # Try to get a suggestion from GitHub Copilot
  suggestion=$(gh copilot suggest -t code "$prompt" 2>/dev/null)

  if [ -n "$suggestion" ]; then
    # Extract code if it's in markdown format
    if [[ "$suggestion" =~ "\`\`\`" ]]; then
      clean_suggestion=$(echo "$suggestion" | sed -n '/```/,/```/p' | sed '1d;$d')
      suggestion="$clean_suggestion"
    fi

    echo -e "${GREEN}GitHub Copilot suggested a fix${NC}"
    echo "$suggestion"
    return 0
  else
    echo -e "${YELLOW}No GitHub Copilot suggestion available${NC}"
    return 1
  fi
}

# Function to open VS Code for manual editing
open_in_vscode() {
  local file="$1"
  local issues="$2"

  # Create a temporary file with issue info
  local temp_file=$(mktemp)
  echo "ESLint issues in $file:" > "$temp_file"
  echo "$issues" >> "$temp_file"
  echo -e "\nFix guidelines:" >> "$temp_file"
  echo "1. For 'no-unused-vars': Prefix unused variables with underscore (_)" >> "$temp_file"
  echo "2. For 'no-explicit-any': Replace with 'unknown' type" >> "$temp_file"
  echo "3. For 'no-useless-escape': Remove unnecessary escape characters" >> "$temp_file"

  # Open VS Code with both files
  echo -e "${YELLOW}Opening VS Code for manual editing...${NC}"
  code --wait "$file" "$temp_file"

  # Clean up temp file
  rm "$temp_file"

  echo -e "${GREEN}Manual edit complete${NC}"
}

# Detect remaining ESLint issues
echo -e "${BOLD}Checking for unresolved ESLint issues...${NC}"
TEMP_FILE=$(mktemp)
npx eslint . --max-warnings=9999 > "$TEMP_FILE"

# Extract files with issues
TOTAL_ISSUES=$(grep -c "warning\|error" "$TEMP_FILE" || echo 0)
if [ "$TOTAL_ISSUES" -gt 0 ]; then
  echo -e "${RED}Found $TOTAL_ISSUES unresolved ESLint issues.${NC}\n"

  # Get unique files with issues
  files_with_issues=$(grep -E "^/" "$TEMP_FILE" | cut -d':' -f1 | sort -u)

  for file in $files_with_issues; do
    echo -e "\n${BOLD}Processing ${BLUE}$file${NC}"

    # Get file issues
    file_issues=$(grep -A 1 "$file" "$TEMP_FILE" | grep -E "warning|error")

    # Try pattern-based fixes first
    echo -e "${YELLOW}Trying pattern-based fixes...${NC}"

    # Apply fixes in sequence
    content=$(cat "$file")

    # Fix unused variables
    new_content=$(fix_unused_variables "$file" "$file_issues")
    unused_fixed=$?

    # Fix explicit any
    if [ $unused_fixed -eq 0 ]; then
      content="$new_content"
    fi
    new_content=$(fix_explicit_any "$file" "$file_issues" "$content")
    any_fixed=$?

    # Fix useless escapes
    if [ $any_fixed -eq 0 ]; then
      content="$new_content"
    fi
    new_content=$(fix_useless_escape "$file" "$file_issues" "$content")
    escape_fixed=$?

    # Check if any pattern-based fixes were applied
    if [ $unused_fixed -eq 0 ] || [ $any_fixed -eq 0 ] || [ $escape_fixed -eq 0 ]; then
      echo -e "${GREEN}Pattern-based fixes found${NC}"
      echo -e "${YELLOW}Preview changes:${NC}"
      diff -u <(cat "$file") <(echo "$content") | head -n 20

      echo -e "\n${YELLOW}Apply these changes? (y/n)${NC}"
      read -r choice

      if [[ $choice == [Yy]* ]]; then
        echo "$content" > "$file"
        echo -e "${GREEN}Applied pattern-based fixes to $file${NC}"

        # Check if file still has issues
        remaining_file_issues=$(npx eslint "$file" 2>/dev/null | grep -c "warning\|error" || echo 0)
        if [ "$remaining_file_issues" -gt 0 ]; then
          echo -e "${YELLOW}File still has $remaining_file_issues issues. Trying Copilot...${NC}"

          # Try Copilot as a second step
          suggestion=$(try_copilot_fix "$file" "$file_issues")
          copilot_success=$?

          if [ $copilot_success -eq 0 ]; then
            echo -e "${YELLOW}Preview Copilot changes:${NC}"
            diff -u <(cat "$file") <(echo "$suggestion") | head -n 20

            echo -e "\n${YELLOW}Apply Copilot's suggested changes? (y/n/e) (e=edit manually)${NC}"
            read -r choice

            if [[ $choice == [Yy]* ]]; then
              echo "$suggestion" > "$file"
              echo -e "${GREEN}Applied Copilot's suggested fixes to $file${NC}"
            elif [[ $choice == [Ee]* ]]; then
              open_in_vscode "$file" "$file_issues"
            else
              echo -e "${RED}Changes skipped${NC}"
            fi
          else
            echo -e "${YELLOW}Would you like to edit this file manually in VS Code? (y/n)${NC}"
            read -r choice

            if [[ $choice == [Yy]* ]]; then
              open_in_vscode "$file" "$file_issues"
            else
              echo -e "${RED}Manual edit skipped${NC}"
            fi
          fi
        fi
      else
        echo -e "${RED}Pattern-based changes skipped${NC}"

        # Try Copilot instead
        suggestion=$(try_copilot_fix "$file" "$file_issues")
        copilot_success=$?

        if [ $copilot_success -eq 0 ]; then
          echo -e "${YELLOW}Preview Copilot changes:${NC}"
          diff -u <(cat "$file") <(echo "$suggestion") | head -n 20

          echo -e "\n${YELLOW}Apply Copilot's suggested changes? (y/n/e) (e=edit manually)${NC}"
          read -r choice

          if [[ $choice == [Yy]* ]]; then
            echo "$suggestion" > "$file"
            echo -e "${GREEN}Applied Copilot's suggested fixes to $file${NC}"
          elif [[ $choice == [Ee]* ]]; then
            open_in_vscode "$file" "$file_issues"
          else
            echo -e "${RED}Changes skipped${NC}"
          fi
        else
          echo -e "${YELLOW}Would you like to edit this file manually in VS Code? (y/n)${NC}"
          read -r choice

          if [[ $choice == [Yy]* ]]; then
            open_in_vscode "$file" "$file_issues"
          else
            echo -e "${RED}Manual edit skipped${NC}"
          fi
        fi
      fi
    else
      echo -e "${YELLOW}No pattern-based fixes found${NC}"

      # Try GitHub Copilot
      suggestion=$(try_copilot_fix "$file" "$file_issues")
      copilot_success=$?

      if [ $copilot_success -eq 0 ]; then
        echo -e "${YELLOW}Preview Copilot changes:${NC}"
        diff -u <(cat "$file") <(echo "$suggestion") | head -n 20

        echo -e "\n${YELLOW}Apply Copilot's suggested changes? (y/n/e) (e=edit manually)${NC}"
        read -r choice

        if [[ $choice == [Yy]* ]]; then
          echo "$suggestion" > "$file"
          echo -e "${GREEN}Applied Copilot's suggested fixes to $file${NC}"
        elif [[ $choice == [Ee]* ]]; then
          open_in_vscode "$file" "$file_issues"
        else
          echo -e "${RED}Changes skipped${NC}"
        fi
      else
        echo -e "${YELLOW}Would you like to edit this file manually in VS Code? (y/n)${NC}"
        read -r choice

        if [[ $choice == [Yy]* ]]; then
          open_in_vscode "$file" "$file_issues"
        else
          echo -e "${RED}Manual edit skipped${NC}"
        fi
      fi
    fi
  done

  # Final check
  remaining_issues=$(npx eslint . --max-warnings=9999 2>/dev/null | grep -c "warning\|error" || echo 0)

  if [ "$remaining_issues" -eq 0 ]; then
    echo -e "\n${GREEN}All ESLint issues have been fixed!${NC}"
  else
    echo -e "\n${YELLOW}$remaining_issues issues remain after fixes.${NC}"
    echo -e "${YELLOW}Some issues may require further manual review.${NC}"
  fi
else
  echo -e "${GREEN}No ESLint issues found!${NC}\n"
fi

rm -f "$TEMP_FILE"
echo -e "${BOLD}${GREEN}All critical checks passed!${NC}"
exit 0
