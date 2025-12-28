def pytest_configure(config):
    # pytest-html creates _metadata ONLY when HTML report is enabled
    if hasattr(config, "_metadata"):
        config._metadata["Project"] = "Judicial Solutions"
        config._metadata["Environment"] = "Production"
        config._metadata["Domain"] = "judicialsolutions.in"
        config._metadata["Test Type"] = "Sanity / Smoke"


def pytest_html_report_title(report):
    report.title = "Judicial Solutions – Sanity Test Report"


def pytest_html_results_summary(prefix, summary, postfix):
    prefix.extend([
        "<p><b>Status:</b> Production Readiness Check</p>",
        "<p><b>Owner:</b> DevOps / Cloud</p>"
    ])