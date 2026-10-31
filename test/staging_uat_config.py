"""Utilities for interpreting optional production references in staging UAT."""

from collections.abc import Mapping

PRODUCTION_RESOURCE_ENV_KEYS = (
    "CV_PRODUCTION_SCRIPT_ID",
    "CV_PRODUCTION_SPREADSHEET_ID",
    "CV_PRODUCTION_RECEIPT_FOLDER_ID",
    "CV_PRODUCTION_BACKUP_FOLDER_ID",
)


def configured_production_resource_ids(environ: Mapping[str, str]) -> set[str]:
    """Return only non-empty configured production resource IDs.

    Staging-only deployments intentionally have no production resource inventory.
    Missing or whitespace-only values are therefore absent, not configuration
    errors. Any configured value is still returned so the caller can reject
    staging/production resource overlap.
    """
    return {
        value
        for key in PRODUCTION_RESOURCE_ENV_KEYS
        if (value := environ.get(key, "").strip())
    }
