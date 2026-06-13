import 'dotenv/config';

import { createWriteStream } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { chromium, errors, type Page } from 'playwright';
import PDFDocument from 'pdfkit';

const PASSED = 'PASSED';
const FAILED = 'FAILED';

type TestStatus = typeof PASSED | typeof FAILED;

type LoginTestConfig = {
  loginUrl: string;
  username: string;
  password: string;
  headless: boolean;
  timeoutMs: number;
  waitAfterLoginMs: number;
  screenshotPath: string;
  reportPath: string;
};

type EmailConfig = {
  enabled: boolean;
  apiKey: string;
  apiSecret: string;
  senderEmail: string;
  senderName: string;
  recipientEmail: string;
  recipientName: string;
  subject: string;
  body: string;
};

type AppConfig = {
  login: LoginTestConfig;
  email: EmailConfig;
};

type TestLog = {
  message: string;
  status: TestStatus;
};

class TestResult {
  readonly logs: TestLog[] = [];
  passed = true;

  addLog(message: string, status: TestStatus = PASSED): void {
    this.logs.push({ message, status });

    if (status === FAILED) {
      this.passed = false;
    }

    console.log(`${status}: ${message}`);
  }
}

class LoginPage {
  constructor(
    private readonly page: Page,
    private readonly config: LoginTestConfig,
    private readonly result: TestResult,
  ) {}

  async open(): Promise<void> {
    try {
      await this.page.goto(this.config.loginUrl, { timeout: this.config.timeoutMs });
      this.result.addLog('Successfully navigated to the login page.');
    } catch (error) {
      this.logTimeout(error, `Timeout: Failed to load login page within ${this.config.timeoutMs} ms.`);
      throw error;
    }
  }

  async submitCredentials(): Promise<void> {
    try {
      await this.page.waitForLoadState('domcontentloaded', { timeout: this.config.timeoutMs });
      await this.page.waitForLoadState('networkidle', { timeout: this.config.timeoutMs }).catch(() => undefined);
      await this.page.waitForTimeout(1000);
      await this.clickLoginEntry();
      this.result.addLog("Clicked on 'Masukan ID Pengguna'.");

      await this.page.getByPlaceholder('ID Pengguna / Email').fill(this.config.username, {
        timeout: this.config.timeoutMs,
      });
      this.result.addLog("Filled 'ID Pengguna / Email'.");

      await this.page.getByPlaceholder('Kata Sandi').fill(this.config.password, {
        timeout: this.config.timeoutMs,
      });
      this.result.addLog("Filled 'Kata Sandi'.");

      await this.page.getByRole('button', { name: 'Masuk' }).click({ timeout: this.config.timeoutMs });
      this.result.addLog("Clicked on 'Masuk' button.");
    } catch (error) {
      this.logTimeout(error, 'Timeout: Interaction with the login form took too long.');
      throw error;
    }
  }

  async verifyLoginSuccess(): Promise<void> {
    try {
      const alert = this.page.getByRole('alert').locator('div').filter({ hasText: 'Berhasil Masuk' });
      await alert.waitFor({ timeout: this.config.timeoutMs });
      this.result.addLog("Login successful: 'Berhasil Masuk' alert found.");
    } catch (error) {
      this.logTimeout(error, "Login failed: Alert with 'Berhasil Masuk' not found.");
    }
  }

  async takeScreenshot(): Promise<void> {
    await this.page.screenshot({ path: this.config.screenshotPath });
    console.log(`Screenshot saved to ${this.config.screenshotPath}`);
  }

  private async clickLoginEntry(): Promise<void> {
    const candidates = [
      this.page.getByText('Masukan ID Pengguna', { exact: true }),
      this.page.getByText(/Masu?k+an ID Pengguna/i),
      this.page.getByRole('button', { name: /ID Pengguna/i }),
      this.page.getByRole('textbox', { name: /ID Pengguna|Email/i }),
      this.page.getByPlaceholder('ID Pengguna / Email'),
    ];

    for (const candidate of candidates) {
      try {
        await candidate.first().waitFor({ state: 'visible', timeout: 1500 });
        await candidate.first().click({ timeout: 1500 });
        return;
      } catch {
        // Try next selector candidate.
      }
    }

    await this.page.getByText('Masukan ID Pengguna').click({ timeout: this.config.timeoutMs });
  }

  private logTimeout(error: unknown, message: string): void {
    if (error instanceof errors.TimeoutError) {
      this.result.addLog(message, FAILED);
      return;
    }

    this.result.addLog(`${message} ${String(error)}`, FAILED);
  }
}

class LoginTestRunner {
  constructor(private readonly config: LoginTestConfig) {}

  async run(): Promise<TestResult> {
    const result = new TestResult();
    const browser = await chromium.launch({ headless: this.config.headless });
    const context = await browser.newContext();
    const page = await context.newPage();
    const loginPage = new LoginPage(page, this.config, result);

    try {
      await loginPage.open();
      await loginPage.submitCredentials();
      await loginPage.verifyLoginSuccess();
      await delay(this.config.waitAfterLoginMs);
      await loginPage.takeScreenshot();
    } finally {
      await context.close();
      await browser.close();
    }

    return result;
  }
}

class PdfReport {
  private readonly pageWidth = 595.28;
  private readonly pageHeight = 841.89;
  private readonly margin = 42;
  private readonly colors = {
    navy: '#1F2A44',
    blue: '#2563EB',
    green: '#16A34A',
    red: '#DC2626',
    amber: '#D97706',
    gray: '#64748B',
    lightGray: '#F1F5F9',
    border: '#CBD5E1',
    white: '#FFFFFF',
  };

  async generate(result: TestResult, screenshotPath: string, outputPath: string): Promise<void> {
    const document = new PDFDocument({
      autoFirstPage: false,
      margin: this.margin,
      size: 'A4',
      info: {
        Title: 'Siswamedia Login Automation Test Report',
        Author: 'Siswamedia Automation',
        Subject: 'TS001 Login Test Result',
      },
    });
    const stream = createWriteStream(outputPath);
    const finished = waitForStream(stream);

    document.pipe(stream);
    this.addSummaryPage(document, result);
    await this.addEvidencePage(document, screenshotPath);
    document.end();

    await finished;
    console.log(`PDF report generated: ${outputPath}`);
  }

  private addSummaryPage(document: PDFKit.PDFDocument, result: TestResult): void {
    const metrics = this.calculateMetrics(result);
    const generatedAt = this.formatDate(new Date());
    const statusColor = result.passed ? this.colors.green : this.colors.red;
    const statusText = result.passed ? 'PASSED' : 'FAILED';

    document.addPage();
    this.addHeader(document, 'Siswamedia Automation Report', 'TS001 Login Test');

    document
      .roundedRect(this.margin, 112, this.pageWidth - this.margin * 2, 82, 10)
      .fillAndStroke(this.colors.lightGray, this.colors.border);

    const summaryTitleY = 132;
    const statusBadgeY = summaryTitleY - 3;
    document.fillColor(this.colors.navy).fontSize(18).text('Executive Summary', this.margin + 18, summaryTitleY);
    this.addStatusBadge(document, statusText, statusColor, this.pageWidth - this.margin - 112, statusBadgeY);
    document
      .fillColor(this.colors.gray)
      .fontSize(10)
      .text('Automated validation for Siswamedia login flow, including page access, credential input, login submission, success alert verification, and evidence capture.', this.margin + 18, 160, {
        width: this.pageWidth - this.margin * 2 - 36,
        lineGap: 2,
      });

    this.addMetricCard(document, 'Success Rate', `${metrics.successRate.toFixed(1)}%`, this.colors.blue, this.margin, 212);
    this.addMetricCard(document, 'Passed Steps', String(metrics.passedCount), this.colors.green, this.margin + 170, 212);
    this.addMetricCard(document, 'Failed Steps', String(metrics.failedCount), metrics.failedCount > 0 ? this.colors.red : this.colors.gray, this.margin + 340, 212);

    this.addSectionTitle(document, 'Test Information', this.margin, 322);
    this.addInfoTable(document, [
      ['Test Case', 'TS001 Login'],
      ['Application', 'Siswamedia'],
      ['Automation Tool', 'Playwright TypeScript'],
      ['Final Status', statusText],
      ['Generated At', generatedAt],
    ], this.margin, 352, 24);

    this.addSectionTitle(document, 'Detailed Test Logs', this.margin, 496);
    this.addLogsTable(document, result.logs, this.margin, 526, 27);

    this.addFooter(document, 1);
  }

  private async addEvidencePage(document: PDFKit.PDFDocument, screenshotPath: string): Promise<void> {
    document.addPage();
    this.addHeader(document, 'Screenshot Evidence', 'Captured browser state after test execution');
    this.addSectionTitle(document, 'Captured Screenshot', this.margin, 118);

    if (await fileExists(screenshotPath)) {
      const imageTop = 170;
      const imageHeight = 570;
      const imageWidth = this.pageWidth - this.margin * 2 - 28;

      document
        .roundedRect(this.margin, 155, this.pageWidth - this.margin * 2, 610, 8)
        .strokeColor(this.colors.border)
        .stroke();

      document.image(screenshotPath, this.margin + 14, imageTop, {
        fit: [imageWidth, imageHeight],
        align: 'center',
        valign: 'center',
      });
      document.y = imageTop + imageHeight;
    } else {
      document
        .roundedRect(this.margin, 155, this.pageWidth - this.margin * 2, 140, 8)
        .fillAndStroke(this.colors.lightGray, this.colors.border)
        .fillColor(this.colors.gray)
        .fontSize(12)
        .text('No screenshot evidence available.', this.margin + 20, 215, {
          width: this.pageWidth - this.margin * 2 - 40,
          align: 'center',
        });
    }

    this.addFooter(document, 2);
  }

  private addHeader(document: PDFKit.PDFDocument, title: string, subtitle: string): void {
    document
      .rect(0, 0, this.pageWidth, 92)
      .fill(this.colors.navy);

    document
      .fillColor(this.colors.white)
      .fontSize(20)
      .text(title, this.margin, 28)
      .fontSize(11)
      .fillColor('#BFDBFE')
      .text(subtitle, this.margin, 56);
  }

  private addFooter(document: PDFKit.PDFDocument, pageNumber: number): void {
    const footerLineY = 780;
    const footerTextY = 790;
    const previousY = document.y;

    document
      .moveTo(this.margin, footerLineY)
      .lineTo(this.pageWidth - this.margin, footerLineY)
      .strokeColor(this.colors.border)
      .stroke();

    document.fillColor(this.colors.gray).fontSize(9);
    this.drawSingleLineText(document, 'Siswamedia Automation', this.margin, footerTextY, 180, 'left');
    this.drawSingleLineText(document, `Page ${pageNumber}`, this.pageWidth - this.margin - 60, footerTextY, 60, 'right');
    document.y = previousY;
  }

  private drawSingleLineText(
    document: PDFKit.PDFDocument,
    text: string,
    x: number,
    y: number,
    width: number,
    align: 'left' | 'right' | 'center',
  ): void {
    const wrappedText = document.heightOfString(text, { width }) > this.pageHeight ? text.slice(0, 1) : text;
    document.text(wrappedText, x, y, {
      width,
      align,
      height: 10,
      lineBreak: false,
      continued: false,
    });
  }

  private addStatusBadge(document: PDFKit.PDFDocument, label: string, color: string, x: number, y: number): void {
    const badgeWidth = 94;
    const badgeHeight = 24;
    const badgeRadius = 8;
    const previousY = document.y;

    document.roundedRect(x, y, badgeWidth, badgeHeight, badgeRadius).fill(color);
    document.fillColor(this.colors.white).fontSize(9);

    const labelHeight = document.currentLineHeight();
    const labelY = y + (badgeHeight - labelHeight) / 2;

    document.text(label, x, labelY, {
      width: badgeWidth,
      height: labelHeight,
      align: 'center',
      lineBreak: false,
    });
    document.y = previousY;
  }

  private addMetricCard(document: PDFKit.PDFDocument, label: string, value: string, color: string, x: number, y: number): void {
    document.roundedRect(x, y, 145, 86, 10).fillAndStroke(this.colors.white, this.colors.border);
    document.fillColor(this.colors.gray).fontSize(10).text(label, x + 16, y + 18);
    document.fillColor(color).fontSize(26).text(value, x + 16, y + 40);
  }

  private addDonutChart(document: PDFKit.PDFDocument, successRate: number, passed: boolean, x: number, y: number): void {
    const radius = 72;
    const centerX = x + radius;
    const centerY = y + radius;
    const color = passed ? this.colors.green : this.colors.red;

    document.circle(centerX, centerY, radius).fill(this.colors.lightGray);
    document.circle(centerX, centerY, radius - 18).fill(this.colors.white);
    document.circle(centerX, centerY, radius).strokeColor(color).lineWidth(12).stroke();
    document
      .fillColor(color)
      .fontSize(24)
      .text(`${successRate.toFixed(0)}%`, centerX - 45, centerY - 14, { width: 90, align: 'center' });
    document.fillColor(this.colors.gray).fontSize(9).text('SUCCESS', centerX - 45, centerY + 14, { width: 90, align: 'center' });
  }

  private addSectionTitle(document: PDFKit.PDFDocument, title: string, x: number, y: number): void {
    document.fillColor(this.colors.navy).fontSize(15).text(title, x, y);
    document.moveTo(x, y + 22).lineTo(this.pageWidth - this.margin, y + 22).strokeColor(this.colors.border).stroke();
  }

  private addInfoTable(document: PDFKit.PDFDocument, rows: string[][], x: number, y: number, rowHeight = 28): void {
    const labelWidth = 112;
    const valueWidth = 200;

    rows.forEach(([label, value], index) => {
      const rowY = y + index * rowHeight;
      document.rect(x, rowY, labelWidth, rowHeight).fillAndStroke(this.colors.lightGray, this.colors.border);
      document.rect(x + labelWidth, rowY, valueWidth, rowHeight).fillAndStroke(this.colors.white, this.colors.border);
      document.fillColor(this.colors.navy).fontSize(10).text(label, x + 10, rowY + 9, { width: labelWidth - 20 });
      document.fillColor(this.colors.gray).fontSize(10).text(value, x + labelWidth + 10, rowY + 9, { width: valueWidth - 20 });
    });
  }

  private addLogsTable(document: PDFKit.PDFDocument, logs: TestLog[], x: number, y: number, rowHeight = 34): void {
    const colNo = 36;
    const colStatus = 82;
    const colMessage = this.pageWidth - this.margin * 2 - colNo - colStatus;
    const headerHeight = 26;

    document.rect(x, y, colNo + colStatus + colMessage, headerHeight).fill(this.colors.navy);
    document.fillColor(this.colors.white).fontSize(10);
    document.text('No', x + 10, y + 9, { width: colNo - 16 });
    document.text('Status', x + colNo + 10, y + 9, { width: colStatus - 16 });
    document.text('Step Description', x + colNo + colStatus + 10, y + 9, { width: colMessage - 20 });

    logs.forEach((log, index) => {
      const rowY = y + headerHeight + index * rowHeight;
      const fillColor = index % 2 === 0 ? this.colors.white : this.colors.lightGray;
      const statusColor = log.status === PASSED ? this.colors.green : this.colors.red;

      document.rect(x, rowY, colNo + colStatus + colMessage, rowHeight).fillAndStroke(fillColor, this.colors.border);
      document.fillColor(this.colors.gray).fontSize(9).text(String(index + 1), x + 10, rowY + 11, { width: colNo - 16 });
      document.fillColor(statusColor).fontSize(9).text(log.status, x + colNo + 10, rowY + 11, { width: colStatus - 16 });
      document.fillColor(this.colors.navy).fontSize(9).text(log.message, x + colNo + colStatus + 10, rowY + 8, {
        width: colMessage - 20,
        height: rowHeight - 8,
      });
    });
  }

  private calculateMetrics(result: TestResult): { passedCount: number; failedCount: number; successRate: number } {
    const passedCount = result.logs.filter((log) => log.status === PASSED).length;
    const failedCount = result.logs.filter((log) => log.status === FAILED).length;
    const totalCount = result.logs.length;
    const successRate = totalCount === 0 ? 0 : (passedCount / totalCount) * 100;

    return { passedCount, failedCount, successRate };
  }

  private formatDate(date: Date): string {
    return new Intl.DateTimeFormat('id-ID', {
      dateStyle: 'full',
      timeStyle: 'long',
    }).format(date);
  }
}

class EmailSender {
  constructor(private readonly config: EmailConfig) {}

  async sendAttachment(attachmentPath: string): Promise<void> {
    if (!this.config.enabled) {
      console.log('Email sending skipped. Set SEND_EMAIL=true to enable.');
      return;
    }

    this.validateConfig();

    const encodedFile = await this.readAttachment(attachmentPath);
    const response = await fetch('https://api.mailjet.com/v3.1/send', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.config.apiKey}:${this.config.apiSecret}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(this.buildPayload(basename(attachmentPath), encodedFile)),
    });

    console.log(`Email sent status: ${response.status}`);

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Mailjet request failed: ${response.status} ${errorBody}`);
    }
  }

  private validateConfig(): void {
    if (!this.config.apiKey || !this.config.apiSecret) {
      throw new Error('MAILJET_API_KEY and MAILJET_API_SECRET are required when SEND_EMAIL=true.');
    }
  }

  private async readAttachment(attachmentPath: string): Promise<string> {
    const file = await readFile(attachmentPath);
    return file.toString('base64');
  }

  private buildPayload(filename: string, encodedFile: string): unknown {
    return {
      Messages: [
        {
          From: {
            Email: this.config.senderEmail,
            Name: this.config.senderName,
          },
          To: [
            {
              Email: this.config.recipientEmail,
              Name: this.config.recipientName,
            },
          ],
          Subject: this.config.subject,
          TextPart: this.config.body,
          Attachments: [
            {
              ContentType: 'application/pdf',
              Filename: filename,
              Base64Content: encodedFile,
            },
          ],
        },
      ],
    };
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  let result: TestResult;

  try {
    result = await new LoginTestRunner(config.login).run();
  } catch (error) {
    console.error(`Test stopped because required step failed: ${String(error)}`);
    result = new TestResult();
    result.addLog('Test stopped because required step failed.', FAILED);
  }

  await new PdfReport().generate(result, config.login.screenshotPath, config.login.reportPath);
  await new EmailSender(config.email).sendAttachment(config.login.reportPath);
}

function loadConfig(): AppConfig {
  return {
    login: {
      loginUrl: readEnv('LOGIN_URL', 'https://app.siswamedia.com/login'),
      username: readEnv('LOGIN_USERNAME', ''),
      password: readEnv('LOGIN_PASSWORD', ''),
      headless: readBooleanEnv('HEADLESS', true),
      timeoutMs: readNumberEnv('TIMEOUT_MS', 5000),
      waitAfterLoginMs: readNumberEnv('WAIT_AFTER_LOGIN_SECONDS', 3) * 1000,
      screenshotPath: resolve(readEnv('SCREENSHOT_PATH', 'screenshot1.png')),
      reportPath: resolve(readEnv('REPORT_PATH', 'test_report.pdf')),
    },
    email: {
      enabled: readBooleanEnv('SEND_EMAIL', false),
      apiKey: readEnv('MAILJET_API_KEY', ''),
      apiSecret: readEnv('MAILJET_API_SECRET', ''),
      senderEmail: readEnv('EMAIL_SENDER', 'automation@example.com'),
      senderName: readEnv('EMAIL_SENDER_NAME', 'Automation Test'),
      recipientEmail: readEnv('EMAIL_RECIPIENT', 'recipient@example.com'),
      recipientName: readEnv('EMAIL_RECIPIENT_NAME', 'Recipient'),
      subject: readEnv('EMAIL_SUBJECT', 'Automation Test Report'),
      body: readEnv('EMAIL_BODY', 'Attached automation test report.'),
    },
  };
}

function readEnv(name: string, defaultValue: string): string {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value : defaultValue;
}

function readBooleanEnv(name: string, defaultValue: boolean): boolean {
  const value = process.env[name];

  if (!value) {
    return defaultValue;
  }

  return ['1', 'true', 'yes', 'y'].includes(value.toLowerCase());
}

function readNumberEnv(name: string, defaultValue: number): number {
  const value = process.env[name];
  const parsedValue = value ? Number(value) : Number.NaN;

  return Number.isFinite(parsedValue) ? parsedValue : defaultValue;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, milliseconds);
  });
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function waitForStream(stream: NodeJS.WritableStream): Promise<void> {
  return new Promise((resolveStream, rejectStream) => {
    stream.on('finish', resolveStream);
    stream.on('error', rejectStream);
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
