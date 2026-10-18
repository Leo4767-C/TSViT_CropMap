#!/usr/bin/env python3
"""
Hugging Face Spaces Entrypoint (Gradio SDK / Python)
Runs the TSViT Crop Map web application on port 7860.
"""

import os
import sys

# Add project root to sys.path
ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ROOT_DIR)

from webapp.server import run

if __name__ == '__main__':
    # Hugging Face Spaces uses port 7860 by default
    port = int(os.environ.get('PORT', 7860))
    print(f"Starting TSViT Crop Map on port {port}...")
    run(port=port)
