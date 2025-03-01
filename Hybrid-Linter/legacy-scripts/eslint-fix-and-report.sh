#!/bin/bash

# Text formatting
BOLD='\033[1m'
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BOLD}Running ESLint auto-fix and generating concise report...${NC}\n"

# Step 1: Run ESLint with --fix to auto-correct all possible issues
echo -e "${YELLOW}Auto-fixing ESLint issues...${NC}"
npx eslint . --fix --max-warnings=9999 --quiet

# Step 2: Generate a detailed report
echo -e "\n${YELLOW}Analyzing remaining issues...${NC}"

# Create a temporary file to store the full ESLint output
TEMP_FILE=$(mktemp)
npx eslint . --max-warnings=9999 > $TEMP_FILE

# Count total issues
TOTAL_WARNINGS=$(grep -c "warning" $TEMP_FILE || echo 0)
TOTAL_ERRORS=$(grep -c "error" $TEMP_FILE || echo 0)
TOTAL_ISSUES=$((TOTAL_WARNINGS + TOTAL_ERRORS))

if [ $TOTAL_ISSUES -gt 0 ]; then
  # Extract unique error types per file
  echo -e "\n${BOLD}Unique Issues Per File:${NC}"

  # Process the ESLint output file by file
  current_file=""
  error_types=()
  error_counts=()

  while IFS= read -r line; do
    # New file detected
    if [[ $line =~ ^/ ]]; then
      # If we were processing a file, print its summary before moving to the next
      if [ ! -z "$current_file" ]; then
        echo -e "\n${BLUE}$current_file${NC}"
        for i in "${!error_types[@]}"; do
          echo -e "  ${error_counts[$i]} ${error_types[$i]}"
        done
      fi

      # Start new file
      current_file=$(echo "$line" | cut -d':' -f1)
      error_types=()
      error_counts=()
    elif [[ $line =~ warning|error ]]; then
      # Extract error type and severity
      if [[ $line =~ error ]]; then
        severity="${RED}error${NC}"
      else
        severity="${YELLOW}warning${NC}"
      fi

      error_msg=$(echo "$line" | sed -E 's/.*((warning|error)  )(.*)/\3/')

      # Check if we already have this type
      found=false
      for i in "${!error_types[@]}"; do
        if [ "${error_types[$i]}" == "$severity  $error_msg" ]; then
          error_counts[$i]=$((error_counts[$i] + 1))
          found=true
          break
        fi
      done

      if [ "$found" = false ]; then
        error_types+=("$severity  $error_msg")
        error_counts+=(1)
      fi
    fi
  done < <(cat "$TEMP_FILE")

  # Print the last file if any
  if [ ! -z "$current_file" ]; then
    echo -e "\n${BLUE}$current_file${NC}"
    for i in "${!error_types[@]}"; do
      echo -e "  ${error_counts[$i]} ${error_types[$i]}"
    done
  fi
else
  echo -e "${GREEN}No ESLint issues found.${NC}"
fi

# Clean up
rm $TEMP_FILE

echo -e "\n${BOLD}Summary:${NC}"
echo -e "${YELLOW}$TOTAL_WARNINGS warnings${NC}, ${RED}$TOTAL_ERRORS errors${NC} (Total: $TOTAL_ISSUES issues)"
echo -e "ESLint auto-fix applied, but some issues require manual attention."
echo -e "Focus on resolving the ${RED}errors${NC} first, then address warnings if needed."

# Common fixes suggestion
echo -e "\n${BOLD}Common Fixes:${NC}"
echo -e "1. For unused variables: Either use them or prefix with underscore (e.g., _unusedVar)"
echo -e "2. For explicit any: Add proper type annotations"
echo -e "3. For React component props: Add proper interface definitions"
echo -e "4. For unnecessary escapes: Remove backslashes before characters that don't need escaping"

exit 0
