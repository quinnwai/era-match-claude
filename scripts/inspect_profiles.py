#!/usr/bin/env python3
"""Debug tool: view compressed profiles and token count."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import tiktoken
from src.config import DB_PATH
from src.profiles import get_compressed_profiles, get_full_profiles
from src.db import get_enriched_contacts

def main():
    contacts = get_enriched_contacts(DB_PATH)
    print(f"Enriched contacts: {len(contacts)}")

    compressed = get_compressed_profiles(DB_PATH, shuffle=False)
    enc = tiktoken.get_encoding("cl100k_base")
    tokens = len(enc.encode(compressed))
    print(f"Compressed profiles: {tokens} tokens, {len(compressed)} chars")

    # Show first 3 profiles
    lines = compressed.split("\n\n")
    print(f"\n--- Sample (first 3 profiles) ---")
    for p in lines[:3]:
        print(p)
        print()

    # Show a full profile
    cid = contacts[0]["contact_id"]
    full = get_full_profiles(DB_PATH, [cid])
    print(f"--- Full profile (ID:{cid}) ---")
    print(full)

if __name__ == "__main__":
    main()
