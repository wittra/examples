#!/usr/bin/env python3
# Copyright (c) 2024 Nida Tech AB. All rights reserved.

"""
standalone-mioty-cbor-decoder.py

This script is designed to take a stream of hexadecimal-encoded CBOR data from the command line,
decode it, and output the decoded data as JSON. It is intended to be used in a pipeline,
such as from a data streaming source.

Usage: Stream hex data via a pipe over stdin:
    data_streamer | ./standalone-mioty-cbor-decoder.py

Or, supply a single packet:
    tools/standalone-mioty-cbor-decoder.py -v -s "," -p "10, a1, 62, 76, 33, a3, 61, 73, 61, 65, 61, 64, bf, 61, 74,\
19, 67, 45, 61, 75, 82, 00, 18, 22"

Example output:
DEBUG:root:Got request: POST event
{"v3": {"s": "e", "d": {"t": 26437, "u": [0, 34]}}}%

The script expects each line of input to contain one packet of data in hexadecimal string format.
"""

import argparse
import json
import logging
import sys
from typing import Final

import cbor2

# Constants representing message types and actions
MIOTY_WITTRA_CBOR_PKT: Final = 0xC0


# Utility functions for interpreting message data
def _get_topic_nibble(byte: int) -> int:
    """Extracts the lower nibble of a byte representing the topic."""
    return byte & 0x0F


def _get_method_nibble(byte: int) -> int:
    """Extracts the upper nibble of a byte representing the method and shifts it to a 0-15 range."""
    return (byte & 0xF0) >> 4


def _topic_to_string(topic: int) -> str:
    """Converts a topic integer to a string representation."""
    topics = ["event", "config", "state"]
    return topics[topic] if topic < len(topics) else "unknown topic"


def _method_to_string(method: int) -> str:
    """Converts a method integer to a string representation."""
    methods = ["GET", "POST", "PUT", "DELETE"]
    return methods[method] if method < len(methods) else "unknown METHOD"


def decode_message(data: list, output: bool = True) -> dict:
    """Decodes a single CBOR-encoded message and prints the result as JSON."""
    if data is None or len(data) < 1:
        logging.error("No payload or payload too short")
        return

    request_type_byte = data[0]
    cbor_payload = bytearray(data[1:])
    method = _get_method_nibble(request_type_byte)
    topic = _get_topic_nibble(request_type_byte)
    logging.debug(f"Got request: {_method_to_string(method)} {_topic_to_string(topic)}")

    try:
        decoded_data = cbor2.loads(cbor_payload)
    except Exception as e:
        logging.exception(f"CBOR decode failed: {e}")
        return

    if output:
        json_byte_payload = json.dumps(decoded_data).encode("utf-8")
        sys.stdout.buffer.write(json_byte_payload)
        sys.stdout.buffer.flush()
    return decoded_data


if __name__ == "__main__":
    # Parse command-line arguments
    parser = argparse.ArgumentParser(description="Decode a hex stream of CBOR-encoded data to JSON.")
    parser.add_argument("-v", "--verbose", help="Increase output verbosity", action="store_true")
    parser.add_argument("-p", "--packet", help="Decode a single packet and exit", type=str)
    parser.add_argument("-s", "--separator", help="Separator between bytes", type=str)
    args = parser.parse_args()

    # Configure logging
    log_level = logging.DEBUG if args.verbose else logging.WARNING
    logging.basicConfig(level=log_level)
    separator = "" if args.separator is None else args.separator
    if args.packet:
        # If a single packet is provided, decode it and exit
        try:
            data = bytes.fromhex(args.packet.strip().replace(separator, ""))
            decode_message(data)
        except ValueError as e:
            logging.exception(f"Failed to decode provided packet: {e}")
    else:
        # Process each line from stdin in streaming mode
        for line in sys.stdin.buffer:
            try:
                data = bytes.fromhex(line.strip().decode("utf-8").replace(separator, ""))
                decode_message(data)
            except ValueError as e:
                logging.exception(f"Failed to process input line: {e}")
