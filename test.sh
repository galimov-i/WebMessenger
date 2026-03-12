#!/bin/bash

# Messenger Test Suite
# Full-stack tests with beautiful TUI

set -euo pipefail

# Color definitions
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Icons
CHECK="✓"
CROSS="✗"
ARROW="➜"
INFO="ℹ"
WARN="⚠"
ROCKET="🚀"
MICROSCOPE="🧪"
COMPUTER="💻"
SERVER="🖥️"
CLIENT="📱"
SUCCESS="✅"
FAILURE="❌"

# Helper functions
print_color() {
    local color="$1"
    local msg="$2"
    echo -e "${color}${msg}${NC}"
}

print_header() {
    echo
    print_color $CYAN "=========================================="
    print_color $CYAN "  $ROCKET  Messenger Test Suite"
    print_color $CYAN "=========================================="
    echo
}

print_success() {
    print_color $GREEN "${SUCCESS} $1"
}

print_error() {
    print_color $RED "${FAILURE} $1"
}

print_info() {
    print_color $BLUE "${INFO} $1"
}

print_warn() {
    print_color $YELLOW "${WARN} $1"
}

print_step() {
    print_color $MAGENTA "${ARROW} $1"
}

# Progress bar
# Usage: progress_bar <current> <total> <width>
progress_bar() {
    local current=$1
    local total=$2
    local width=${3:-40}
    local percent=$((current * 100 / total))
    local filled=$((current * width / total))
    local empty=$((width - filled))
    printf "["
    printf "%${filled}s" "" | tr ' ' '█'
    printf "%${empty}s" "" | tr ' ' '░'
    printf "] %3d%% (%d/%d)\r" $percent $current $total
}

# Run command and capture output, exit on failure
run_cmd() {
    local cmd="$1"
    local desc="$2"
    print_step "$desc"
    echo -e "  ${BLUE}${cmd}${NC}"
    if eval "$cmd"; then
        print_success "Done"
        return 0
    else
        print_error "Failed"
        return 1
    fi
}

# Run Go tests
run_go_tests() {
    print_header
    print_color $CYAN "${SERVER} Running Server Tests (Go)..."
    echo

    local test_output
    local exit_code=0
    test_output=$(cd Server && go test -v ./... 2>&1) || exit_code=$?

    if [[ $exit_code -eq 0 ]]; then
        print_success "All server tests passed!"
        echo "$test_output" | tail -5
        return 0
    else
        print_error "Some server tests failed."
        echo "$test_output" | grep -E "FAIL|Error" | head -20
        return 1
    fi
}

# Run client tests (if npm is available)
run_client_tests() {
    if [[ ! -f "Client/package.json" ]]; then
        print_warn "Client/package.json not found. Skipping client tests."
        print_info "To add client tests, run: cd Client && npm init && npm install --save-dev jest"
        return 0
    fi

    print_header
    print_color $CYAN "${CLIENT} Running Client Tests (JavaScript)..."
    echo

    if command -v npm &> /dev/null; then
        run_cmd "cd Client && npm test" "Running npm test"
    else
        print_error "npm not found. Skipping client tests."
        return 1
    fi
}

# Main function
main() {
    print_header

    local start_time=$(date +%s)
    local server_ok=true
    local client_ok=true

    # Server tests
    if run_go_tests; then
        print_success "Server tests passed."
    else
        print_error "Server tests failed."
        server_ok=false
    fi

    echo
    print_color $CYAN "------------------------------------------"
    echo

    # Client tests
    if $server_ok || [[ "${FORCE_CLIENT:-false}" == "true" ]]; then
        if run_client_tests; then
            print_success "Client tests passed."
        else
            print_error "Client tests failed."
            client_ok=false
        fi
    else
        print_warn "Skipping client tests due to server failures."
        print_info "Set FORCE_CLIENT=true to run anyway."
    fi

    # Summary
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    echo
    print_color $CYAN "=========================================="
    print_color $CYAN "               Test Summary"
    print_color $CYAN "=========================================="
    echo
    if $server_ok && $client_ok; then
        print_success "All tests passed! ${CHECK}"
    else
        print_error "Some tests failed. ${CROSS}"
    fi
    echo
    print_color $YELLOW "Server: $($server_ok && echo "PASS" || echo "FAIL")"
    print_color $YELLOW "Client: $($client_ok && echo "PASS" || echo "FAIL")"
    print_color $YELLOW "Duration: ${duration}s"
    echo
    print_color $CYAN "=========================================="

    # Exit code
    if $server_ok && $client_ok; then
        exit 0
    else
        exit 1
    fi
}

# Run main
main "$@"