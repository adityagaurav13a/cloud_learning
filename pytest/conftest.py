def pytest_html_results_summary(prefix, summary, postfix):
    prefix.extend([
        "<p><b>Status:</b> Production Readiness Check</p>",
        "<p><b>Owner:</b> DevOps / Cloud</p>"
    ])

def pytest_configure(config):
    config._metadata["Project"] = "Judicial Solutions"
    config._metadata["Environment"] = "Production"
    config._metadata["Domain"] = "judicialsolutions.in"
    config._metadata["Test Type"] = "Sanity / Smoke"

def pytest_html_report_title(report):
    report.title = "Judicial Solutions – Sanity Test Report"

