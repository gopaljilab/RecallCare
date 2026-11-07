"""
Configuration settings for the RecallCare Python pipeline (built on Clinical Insight Engine).
"""
import os

# Privacy/Anonymization feature flags
ENABLE_PHI_REDACTION = os.environ.get("ENABLE_PHI_REDACTION", "true").lower() == "true"
