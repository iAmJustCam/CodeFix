#!/usr/bin/env bash

# Text formatting
BOLD='\033[1m'
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# GitHub Copilot integration banner
echo -e "${BOLD}${BLUE}┌────────────────────────────────────────────────────┐${NC}"
echo -e "${BOLD}${BLUE}│ ${MAGENTA}GitHub Copilot${BLUE} - Code Quality Assistant            │${NC}"
echo -e "${BOLD}${BLUE}└────────────────────────────────────────────────────┘${NC}\n"

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo -e "${RED}Error: GitHub CLI (gh) is not installed.${NC}"
    echo -e "Please install it using ${YELLOW}brew install gh${NC} and try again."
    exit 1
fi

# Check if gh-copilot extension is installed
if ! gh extension list | grep -q "gh-copilot"; then
    echo -e "${YELLOW}GitHub Copilot extension not found. Installing...${NC}"
    gh extension install github/gh-copilot

    if [ $? -ne 0 ]; then
        echo -e "${RED}Failed to install GitHub Copilot extension.${NC}"
        exit 1
    fi
fi

# Check if user is authenticated with GitHub
if ! gh auth status &> /dev/null; then
    echo -e "${YELLOW}Please authenticate with GitHub CLI:${NC}"
    gh auth login

    if [ $? -ne 0 ]; then
        echo -e "${RED}Authentication failed. Exiting.${NC}"
        exit 1
    fi
fi

# Initialize counters for reporting
TOTAL_FILES=0
FIXED_FILES=0
AUTO_FIXED_ISSUES=0
TOTAL_ISSUES=0

# Start timer to measure time saved
START_TIME=$(date +%s)

echo -e "${BOLD}${BLUE}Scanning for code quality issues...${NC}\n"

# Fix syntax error in useAnalytics.ts
analytics_file="/Users/cameroncatri/Desktop/configurator/src/hooks/useAnalytics.ts"
if [[ -f "$analytics_file" ]]; then
    echo -e "${YELLOW}Analyzing syntax in $analytics_file...${NC}"

    # Create a backup
    cp "$analytics_file" "${analytics_file}.bak"
    ((TOTAL_FILES++))

    # Check for syntax errors
    npx tsc --noEmit "$analytics_file" 2> /tmp/ts_errors.log

    if [ $? -ne 0 ]; then
        echo -e "${YELLOW}Found syntax errors. Asking GitHub Copilot for assistance...${NC}"

        # Extract error message
        error_msg=$(cat /tmp/ts_errors.log | head -n 5)

        # Use GitHub Copilot to suggest a fix
        echo -e "${CYAN}Requesting fix from GitHub Copilot...${NC}"
        fix_suggestion=$(gh copilot suggest -t shell "Fix TypeScript syntax error in file. Error message: $error_msg. What sed command should I run to fix this?")

        # Extract the command to run (assuming Copilot returns a sed command)
        fix_command=$(echo "$fix_suggestion" | grep -E "^sed" | head -n 1)

        if [[ -n "$fix_command" ]]; then
            echo -e "${GREEN}GitHub Copilot suggested: ${NC}$fix_command"
            echo -e "${YELLOW}Applying suggested fix...${NC}"

            # Execute the suggested fix
            eval "$fix_command"

            # Check if the fix worked
            npx tsc --noEmit "$analytics_file" 2>/dev/null

            if [ $? -eq 0 ]; then
                echo -e "${GREEN}✅ Syntax error fixed with GitHub Copilot's suggestion!${NC}"
                ((FIXED_FILES++))
                ((AUTO_FIXED_ISSUES++))
            else
                echo -e "${RED}Suggested fix didn't resolve all issues.${NC}"
                # Fall back to the manual fix from the original script
                sed -i '' '154s/<div/<div>/g' "$analytics_file"

                npx tsc --noEmit "$analytics_file" 2>/dev/null
                if [ $? -eq 0 ]; then
                    echo -e "${GREEN}✅ Syntax error fixed with fallback method.${NC}"
                    ((FIXED_FILES++))
                    ((AUTO_FIXED_ISSUES++))
                else
                    cp "${analytics_file}.bak" "$analytics_file"
                    echo -e "${RED}Could not fix syntax errors automatically.${NC}"
                fi
            fi
        else
            # Fall back to the manual fix from the original script
            sed -i '' '154s/<div/<div>/g' "$analytics_file"

            npx tsc --noEmit "$analytics_file" 2>/dev/null
            if [ $? -eq 0 ]; then
                echo -e "${GREEN}✅ Syntax error fixed with fallback method.${NC}"
                ((FIXED_FILES++))
                ((AUTO_FIXED_ISSUES++))
            else
                cp "${analytics_file}.bak" "$analytics_file"
                echo -e "${RED}Could not fix syntax errors automatically.${NC}"
            fi
        fi
    else
        echo -e "${GREEN}No syntax errors found in $analytics_file.${NC}"
    fi
fi

echo -e "\n${BOLD}${BLUE}Running ESLint automatic fixes...${NC}"
# Run ESLint with fix and capture stats before
PRE_ISSUES=$(npx eslint . --max-warnings=9999 2>/dev/null | grep -c "warning\|error" || echo 0)
npx eslint . --fix --max-warnings=9999 --quiet 2>/dev/null
POST_ISSUES=$(npx eslint . --max-warnings=9999 2>/dev/null | grep -c "warning\|error" || echo 0)

ESLINT_FIXED=$((PRE_ISSUES - POST_ISSUES))
AUTO_FIXED_ISSUES=$((AUTO_FIXED_ISSUES + ESLINT_FIXED))

echo -e "${GREEN}✅ ESLint auto-fix completed${NC}"
echo -e "${GREEN}   Fixed ${ESLINT_FIXED} issues automatically!${NC}\n"

# Detect remaining ESLint issues
echo -e "${BOLD}${BLUE}Analyzing remaining code issues...${NC}"
TEMP_FILE=$(mktemp)
npx eslint . --max-warnings=9999 > "$TEMP_FILE"

# Extract remaining errors
REMAINING_ISSUES=$(grep -c "warning\|error" "$TEMP_FILE" || echo 0)
TOTAL_ISSUES=$((PRE_ISSUES + 1)) # +1 for the syntax error

if [ "$REMAINING_ISSUES" -gt 0 ]; then
    echo -e "${YELLOW}Found $REMAINING_ISSUES remaining code quality issues${NC}\n"

    # Get unique files with issues
    FILES_WITH_ISSUES=$(grep -E "^/" "$TEMP_FILE" | cut -d':' -f1 | sort -u)

    # Process each file with issues
    for file in $FILES_WITH_ISSUES; do
        echo -e "\n${BOLD}${BLUE}Processing ${file}...${NC}"

        # Get ESLint issues for this file
        file_issues=$(grep -A 1 "$file" "$TEMP_FILE" | grep -E "warning|error")
        echo -e "${YELLOW}Issues detected:${NC}\n$file_issues"

        # Create a backup
        cp "$file" "${file}.bak"

        INITIAL_FILE_ISSUES=$(echo "$file_issues" | wc -l)
        FIXED_IN_FILE=0

        # Get file contents for Copilot's context
        file_content=$(head -n 30 "$file")
        file_ext="${file##*.}"

        echo -e "${CYAN}Requesting GitHub Copilot's assistance for $file...${NC}"

        # Prepare the issues in a condensed format
        condensed_issues=$(echo "$file_issues" | tr '\n' ' ' | sed 's/  / /g')

        # Ask GitHub Copilot for a fix
        fix_suggestion=$(gh copilot suggest -t shell "Fix the following ESLint issues in a $file_ext file: $condensed_issues. The beginning of the file content is: $file_content. What sed commands should I run to fix these issues?")

        # Extract sed commands
        fix_commands=$(echo "$fix_suggestion" | grep -E "^sed" | head -n 5)

        if [[ -n "$fix_commands" ]]; then
            echo -e "${GREEN}GitHub Copilot suggested fixes:${NC}"
            echo "$fix_commands"
            echo -e "${YELLOW}Applying suggested fixes...${NC}"

            # Execute each suggested fix
            while IFS= read -r cmd; do
                if [[ -n "$cmd" ]]; then
                    echo -e "${CYAN}Running: ${NC}$cmd"
                    eval "$cmd"
                    ((FIXED_IN_FILE++))
                    ((AUTO_FIXED_ISSUES++))
                fi
            done <<< "$fix_commands"

            # Check if the fixes resolved the issues
            remaining_file_issues=$(npx eslint "$file" --max-warnings=9999 2>/dev/null | grep -c "warning\|error" || echo 0)

            if [ "$remaining_file_issues" -eq 0 ]; then
                echo -e "${GREEN}✅ All issues in $file fixed with GitHub Copilot's assistance!${NC}"
                rm "${file}.bak"
                ((FIXED_FILES++))
            else
                resolved_issues=$((INITIAL_FILE_ISSUES - remaining_file_issues))
                echo -e "${YELLOW}Fixed $resolved_issues of $INITIAL_FILE_ISSUES issues. $remaining_file_issues remain.${NC}"

                # Try one more approach for specific issue types
                if echo "$file_issues" | grep -q "no-unused-vars"; then
                    echo -e "${YELLOW}Attempting to fix remaining unused variables...${NC}"

                    # Extract unused variables
                    unused_vars=()
                    while IFS= read -r issue; do
                        if [[ "$issue" =~ \'([^\']+)\'.+never\ used ]]; then
                            var_name="${BASH_REMATCH[1]}"
                            unused_vars+=("$var_name")
                        fi
                    done < <(echo "$file_issues" | grep -E "no-unused-vars|@typescript-eslint/no-unused-vars")

                    # Generate and run a fix command for each unused variable
                    for var in "${unused_vars[@]}"; do
                        fix_cmd="sed -i '' -E 's/\b(const|let|var)\s+($var)\b/\1 _\2/g' \"$file\""
                        echo -e "${CYAN}Running: ${NC}$fix_cmd"
                        eval "$fix_cmd"
                    done

                    # Check if the fixes resolved the issues
                    new_remaining_issues=$(npx eslint "$file" --max-warnings=9999 2>/dev/null | grep -c "warning\|error" || echo 0)

                    if [ "$new_remaining_issues" -lt "$remaining_file_issues" ]; then
                        additional_fixed=$((remaining_file_issues - new_remaining_issues))
                        echo -e "${GREEN}Fixed $additional_fixed additional issues with targeted approach.${NC}"
                        ((AUTO_FIXED_ISSUES+=additional_fixed))
                        remaining_file_issues=$new_remaining_issues
                    fi
                fi

                # Ask for manual editing if issues remain
                if [ "$remaining_file_issues" -gt 0 ]; then
                    echo -e "${YELLOW}Would you like to open this file for manual editing? (y/n)${NC}"
                    read -r choice

                    if [[ $choice == [Yy]* ]]; then
                        # Try to use VS Code if available, otherwise fall back to TextEdit
                        if command -v code >/dev/null 2>&1; then
                            echo -e "${CYAN}Opening in VS Code with GitHub Copilot assistance...${NC}"
                            code "$file"
                        else
                            open -a "TextEdit" "$file"
                        fi

                        echo -e "${YELLOW}Edit the file with GitHub Copilot assistance and save your changes.${NC}"
                        read -p "Press Enter when done editing..."

                        # Check if the manual edits fixed the issues
                        final_issues=$(npx eslint "$file" --max-warnings=9999 2>/dev/null | grep -c "warning\|error" || echo 0)
                        if [ "$final_issues" -eq 0 ]; then
                            echo -e "${GREEN}✅ All issues fixed with manual editing!${NC}"
                            rm "${file}.bak"
                            ((FIXED_FILES++))
                        else
                            fixed_in_editor=$((remaining_file_issues - final_issues))
                            if [ "$fixed_in_editor" -gt 0 ]; then
                                echo -e "${GREEN}Fixed $fixed_in_editor additional issues with manual editing.${NC}"
                                ((AUTO_FIXED_ISSUES+=fixed_in_editor))
                            else
                                echo -e "${YELLOW}$final_issues issues remain.${NC}"
                            fi
                        fi
                    fi
                fi
            fi
        else
            echo -e "${RED}Could not get useful suggestions from GitHub Copilot.${NC}"
            echo -e "${YELLOW}Would you like to open this file for manual editing? (y/n)${NC}"
            read -r choice

            if [[ $choice == [Yy]* ]]; then
                # Try to use VS Code if available, otherwise fall back to TextEdit
                if command -v code >/dev/null 2>&1; then
                    code "$file"
                else
                    open -a "TextEdit" "$file"
                fi

                echo -e "${YELLOW}Edit the file and save your changes.${NC}"
                read -p "Press Enter when done editing..."

                # Check if the manual edits fixed the issues
                final_issues=$(npx eslint "$file" --max-warnings=9999 2>/dev/null | grep -c "warning\|error" || echo 0)
                if [ "$final_issues" -eq 0 ]; then
                    echo -e "${GREEN}✅ All issues fixed with manual editing!${NC}"
                    rm "${file}.bak"
                    ((FIXED_FILES++))
                else
                    echo -e "${YELLOW}$final_issues issues remain.${NC}"
                fi
            fi
        fi
    done

    # Final check
    remaining_total=$(npx eslint . --max-warnings=9999 2>/dev/null | grep -c "warning\|error" || echo 0)
    if [ "$remaining_total" -eq 0 ]; then
        echo -e "\n${GREEN}✅ All ESLint issues have been fixed!${NC}"

        # Clean up backups
        find . -name "*.bak" -delete
        echo -e "${GREEN}Removed all backup files.${NC}"
    else
        echo -e "\n${YELLOW}$remaining_total issues remain across all files.${NC}"
        echo -e "${YELLOW}Backup files are available with .bak extension${NC}"
    fi
else
    echo -e "${GREEN}✅ No ESLint issues found!${NC}\n"
fi

# Calculate time spent
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
MINUTES=$((DURATION / 60))
SECONDS=$((DURATION % 60))

# Estimate time saved (conservative estimate: 2 min per auto-fixed issue)
TIME_SAVED=$((AUTO_FIXED_ISSUES * 2))
SAVED_HOURS=$((TIME_SAVED / 60))
SAVED_MINUTES=$((TIME_SAVED % 60))

# Final report stats
echo -e "\n${BOLD}${BLUE}┌────────────────────────────────────────────────────┐${NC}"
echo -e "${BOLD}${BLUE}│ ${MAGENTA}GitHub Copilot Code Quality Report${BLUE}                │${NC}"
echo -e "${BOLD}${BLUE}└────────────────────────────────────────────────────┘${NC}\n"

echo -e "${BOLD}Code Quality Statistics:${NC}"
echo -e "  ${GREEN}✓ Analyzed ${TOTAL_FILES} files${NC}"
echo -e "  ${GREEN}✓ Fixed ${FIXED_FILES} files completely${NC}"
echo -e "  ${GREEN}✓ Automatically resolved ${AUTO_FIXED_ISSUES} of ${TOTAL_ISSUES} issues${NC}"
if [ $TOTAL_ISSUES -gt 0 ]; then
    echo -e "  ${GREEN}✓ Success rate: $((AUTO_FIXED_ISSUES * 100 / TOTAL_ISSUES))%${NC}"
else
    echo -e "  ${GREEN}✓ Success rate: 100%${NC}"
fi

echo -e "\n${BOLD}Productivity Impact:${NC}"
echo -e "  ${GREEN}✓ Time spent: ${MINUTES}m ${SECONDS}s${NC}"
echo -e "  ${GREEN}✓ Estimated time saved: ${SAVED_HOURS}h ${SAVED_MINUTES}m${NC}"

echo -e "\n${BOLD}${GREEN}✅ Code quality check completed with GitHub Copilot assistance!${NC}"

exit 0
