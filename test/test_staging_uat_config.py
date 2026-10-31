"""Regression tests for production-free staging UAT configuration."""

import unittest

from staging_uat_config import configured_production_resource_ids


class ConfiguredProductionResourceIdsTests(unittest.TestCase):
    def test_staging_only_environment_without_production_references_is_valid(self):
        self.assertEqual(configured_production_resource_ids({}), set())

    def test_empty_and_whitespace_production_references_are_ignored(self):
        environ = {
            "CV_PRODUCTION_SCRIPT_ID": "",
            "CV_PRODUCTION_SPREADSHEET_ID": "   ",
            "CV_PRODUCTION_RECEIPT_FOLDER_ID": "\t",
            "CV_PRODUCTION_BACKUP_FOLDER_ID": "",
        }
        self.assertEqual(configured_production_resource_ids(environ), set())

    def test_configured_production_references_are_retained_for_overlap_checks(self):
        environ = {
            "CV_PRODUCTION_SCRIPT_ID": " script-id ",
            "CV_PRODUCTION_SPREADSHEET_ID": "sheet-id",
            "CV_PRODUCTION_RECEIPT_FOLDER_ID": "",
            "CV_PRODUCTION_BACKUP_FOLDER_ID": "backup-id",
        }
        self.assertEqual(
            configured_production_resource_ids(environ),
            {"script-id", "sheet-id", "backup-id"},
        )


if __name__ == "__main__":
    unittest.main()
