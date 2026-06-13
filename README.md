This project contains an automated End-to-End (E2E) testing script built with **Playwright** and **TypeScript**. It is designed to validate the login flow of the Siswamedia application, capture visual evidence, generate a comprehensive PDF report, and optionally send the report via email.

## 🚀 Features

* **Automated Login Validation:** Simulates real user interactions to test the login mechanism.
* **Resilient Locators:** Uses fallback strategies to locate login elements dynamically.
* **PDF Report Generation:** Automatically creates an executive summary PDF containing test metrics, step-by-step logs, and screenshot evidence using `pdfkit`.
* **Email Integration:** Sends the generated PDF report to designated stakeholders via the Mailjet API.
* **Highly Configurable:** Behavior can be customized completely through environment variables without modifying the code.

---

## 📋 Prerequisites

Before running the script, ensure you have the following installed on your machine:

* **Node.js** (v18 or higher recommended)
* **npm**, **yarn**, or **pnpm**

---

## 🛠️ Installation

1. **Clone the repository** (if applicable) and navigate to the project directory.
2. **Install dependencies:**
Ensure you have the required packages installed. If you haven't set up your `package.json` yet, you will need:
```bash
npm install playwright pdfkit dotenv
npm install -D typescript @types/node @types/pdfkit ts-node

```


3. **Install Playwright Browsers:**
```bash
npx playwright install chromium

```



---

## ⚙️ Configuration (.env)

Create a `.env` file in the root directory of your project. The script is highly customizable using the following environment variables:

### Test Configuration

| Variable | Description | Default Value |
| --- | --- | --- |
| `LOGIN_URL` | The URL of the login page. | `https://app.siswamedia.com/login` |
| `LOGIN_USERNAME` | **(Required)** The username or email for login. | `''` |
| `LOGIN_PASSWORD` | **(Required)** The password for login. | `''` |
| `HEADLESS` | Run the browser in headless mode (`true`/`false`). | `true` |
| `TIMEOUT_MS` | Max wait time for elements/network requests. | `5000` |
| `WAIT_AFTER_LOGIN_SECONDS` | Delay in seconds after login to capture the final state. | `3` |
| `SCREENSHOT_PATH` | File path to save the evidence screenshot. | `screenshot1.png` |
| `REPORT_PATH` | File path to save the generated PDF report. | `test_report.pdf` |

### Email Configuration (Mailjet)

| Variable | Description | Default Value |
| --- | --- | --- |
| `SEND_EMAIL` | Enable email reporting (`true`/`false`). | `false` |
| `MAILJET_API_KEY` | **(Required if SEND_EMAIL=true)** Your Mailjet API Key. | `''` |
| `MAILJET_API_SECRET` | **(Required if SEND_EMAIL=true)** Your Mailjet Secret. | `''` |
| `EMAIL_SENDER` | The sender's email address. | `automation@example.com` |
| `EMAIL_SENDER_NAME` | The sender's display name. | `Automation Test` |
| `EMAIL_RECIPIENT` | The recipient's email address. | `recipient@example.com` |
| `EMAIL_RECIPIENT_NAME` | The recipient's display name. | `Recipient` |
| `EMAIL_SUBJECT` | The subject line of the email. | `Automation Test Report` |
| `EMAIL_BODY` | The text body of the email. | `Attached automation test report.` |

> **Note:** Never commit your actual `.env` file containing real passwords or API keys to version control.

---

## ▶️ Usage

Once your `.env` file is configured, you can execute the script. Assuming your script is named `index.ts`:

Using `ts-node`:

```bash
npx ts-node index.ts

```

Alternatively, you can compile it to JavaScript first and run it:

```bash
npx tsc index.ts
node index.js

```

---

## 📂 Artifacts Generated

After a successful (or failed) run, the script will generate the following artifacts in your configured paths:

1. **Screenshot Evidence (`screenshot1.png`):** A snapshot of the browser state right after the login attempt.
2. **PDF Report (`test_report.pdf`):** A beautifully formatted document containing:
* Executive Summary (Success Rate, Passed/Failed Steps)
* Test Information Details
* Detailed Step-by-Step Execution Logs
* Embedded Screenshot Evidence



---

## 🏗️ Architecture overview

For developers maintaining this script, the code is structured into specific domain classes for separation of concerns:

* `TestResult` & `TestLog`: State management for the test execution.
* `LoginPage`: Page Object Model (POM) handling Playwright interactions and DOM traversal.
* `LoginTestRunner`: Orchestrates the browser launch and test steps.
* `PdfReport`: Handles the drawing and generation of the final PDF using PDFKit.
* `EmailSender`: Manages Mailjet API payload construction and delivery.
