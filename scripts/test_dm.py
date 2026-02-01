#!/usr/bin/env python3
"""Test: have the bot open a DM and send a message."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from slack_sdk import WebClient
from src.config import SLACK_BOT_TOKEN

USER_ID = "U09TT53NSJH"  # Your Slack user ID from the logs

client = WebClient(token=SLACK_BOT_TOKEN)

print("Opening DM conversation...")
result = client.conversations_open(users=USER_ID)
channel_id = result["channel"]["id"]
print(f"DM channel: {channel_id}")

print("Sending test message...")
client.chat_postMessage(
    channel=channel_id,
    text="Hello! DMs are working. Try sending me an ask like: `I need someone who understands enterprise sales`",
)
print("Done — check your Slack DMs.")
