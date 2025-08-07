#!/usr/bin/env python3
"""
Test script for the new SerpAPI and Exa provider functions
"""

import sys
import os

# Add the directory containing multi-provider-tester.py to the path
sys.path.append('/Users/macbook2024/Dropbox/AAA Backup/A Working/Curate-My-World')

from multi_provider_tester import ProviderTester

def main():
    tester = ProviderTester()
    
    # Test SerpAPI
    print("Testing SerpAPI...")
    result = tester.test_serpapi("theatre", "San Francisco, CA", 5)
    print(f"SerpAPI Result: {result}")
    
    # Test Exa
    print("\nTesting Exa...")
    result = tester.test_exa("theatre", "San Francisco, CA", 5)
    print(f"Exa Result: {result}")

if __name__ == "__main__":
    main()
