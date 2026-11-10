const { Resend } = require('resend');
const nodemailer = require('nodemailer');

// In-memory audit log for emails (great for development & live demos)
const emailAuditLog = [];

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === 're_placeholder_key' || apiKey.startsWith('re_your_')) {
    return null;
  }
  return new Resend(apiKey);
}

function getEmailProvider() {
  if (process.env.EMAIL_PROVIDER) {
    return process.env.EMAIL_PROVIDER.toLowerCase();
  }
  if (process.env.SMTP_USER || process.env.SMTP_PASS) {
    return 'smtp';
  }
  return getResendClient() ? 'resend' : 'simulated';
}

/**
 * Universal Send Email function
 */
async function sendEmail({ to, subject, html, text }) {
  const provider = getEmailProvider();
  const from = process.env.EMAIL_FROM || (
    provider === 'smtp'
      ? process.env.SMTP_USER
      : 'RentPulse <onboarding@resend.dev>'
  );
  const logEntry = {
    id: 'eml_' + Math.random().toString(36).substring(2, 9),
    to,
    from,
    subject,
    timestamp: new Date().toISOString(),
    status: 'pending',
    preview: text || subject,
  };

  if (provider === 'smtp') {
    const { SMTP_HOST = 'smtp.gmail.com', SMTP_USER, SMTP_PASS } = process.env;
    const port = Number(process.env.SMTP_PORT || 465);

    if (!SMTP_USER || !SMTP_PASS) {
      const errorMessage = 'SMTP_USER and SMTP_PASS are required when EMAIL_PROVIDER=smtp.';
      logEntry.status = 'failed';
      logEntry.mode = 'smtp';
      logEntry.error = errorMessage;
      emailAuditLog.unshift(logEntry);
      console.error(`[SMTP Email Failed] To: ${to} | ${errorMessage}`);
      return { success: false, mode: 'smtp', error: errorMessage };
    }

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port,
      secure: process.env.SMTP_SECURE
        ? process.env.SMTP_SECURE.toLowerCase() === 'true'
        : port === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    try {
      const info = await transporter.sendMail({ from, to, subject, html, text });
      if (!info.accepted?.length) {
        const errorMessage = 'SMTP server did not accept the recipient.';
        logEntry.status = 'failed';
        logEntry.mode = 'smtp';
        logEntry.error = errorMessage;
        emailAuditLog.unshift(logEntry);
        console.error(`[SMTP Email Failed] To: ${to} | ${errorMessage}`);
        return { success: false, mode: 'smtp', error: errorMessage };
      }

      logEntry.status = 'sent';
      logEntry.mode = 'smtp';
      emailAuditLog.unshift(logEntry);
      console.log(`[SMTP Email Accepted] To: ${to} | Subject: "${subject}" | ID: ${info.messageId}`);
      return { success: true, mode: 'smtp', data: { id: info.messageId } };
    } catch (error) {
      logEntry.status = 'failed';
      logEntry.mode = 'smtp';
      logEntry.error = error.message;
      emailAuditLog.unshift(logEntry);
      console.error(`[SMTP Email Failed] To: ${to} | ${error.message}`);
      return { success: false, mode: 'smtp', error: error.message };
    } finally {
      transporter.close();
    }
  }

  if (provider !== 'resend' && provider !== 'simulated') {
    const errorMessage = `Unsupported EMAIL_PROVIDER "${provider}". Use "smtp" or "resend".`;
    logEntry.status = 'failed';
    logEntry.mode = provider;
    logEntry.error = errorMessage;
    emailAuditLog.unshift(logEntry);
    console.error(`[Email Failed] ${errorMessage}`);
    return { success: false, mode: provider, error: errorMessage };
  }

  const resend = getResendClient();

  if (provider === 'resend' && !resend) {
    const errorMessage = 'RESEND_API_KEY is required when EMAIL_PROVIDER=resend.';
    logEntry.status = 'failed';
    logEntry.mode = 'live';
    logEntry.error = errorMessage;
    emailAuditLog.unshift(logEntry);
    console.error(`[Resend Email Failed] To: ${to} | ${errorMessage}`);
    return { success: false, mode: 'live', error: errorMessage };
  }

  if (provider === 'resend' && resend) {
    try {
      const response = await resend.emails.send({
        from,
        to,
        subject,
        html,
        text,
      });

      if (response.error || !response.data?.id) {
        const errorMessage = response.error?.message || 'Resend did not return an email ID.';
        logEntry.status = 'failed';
        logEntry.mode = 'live';
        logEntry.error = errorMessage;
        emailAuditLog.unshift(logEntry);
        console.error(`[Resend Email Failed] To: ${to} | ${errorMessage}`);
        return { success: false, mode: 'live', error: errorMessage };
      }

      logEntry.status = 'sent';
      logEntry.mode = 'live';
      logEntry.resendId = response.data.id;
      emailAuditLog.unshift(logEntry);
      console.log(`[Resend Email Accepted] To: ${to} | Subject: "${subject}" | ID: ${response.data.id}`);
      return { success: true, mode: 'live', data: response.data };
    } catch (error) {
      console.error(`[Resend Email Failed] To: ${to} | ${error.message}`);
      logEntry.status = 'failed';
      logEntry.mode = 'live';
      logEntry.error = error.message;
      emailAuditLog.unshift(logEntry);
      return { success: false, mode: 'live', error: error.message };
    }
  }

  // Keep local development usable when no email provider is configured.
  logEntry.status = 'simulated';
  logEntry.mode = 'simulated';
  emailAuditLog.unshift(logEntry);
  if (emailAuditLog.length > 50) emailAuditLog.pop();

  console.log(`\n================== [OUTGOING EMAIL (SIMULATED)] ==================`);
  console.log(`To: ${to}`);
  console.log(`Subject: ${subject}`);
  console.log(`Text Preview: ${text || subject}`);
  console.log(`==================================================================\n`);

  return { success: true, mode: 'simulated' };
}

/**
 * Send Tenant Invitation Email with Invite Link
 */
async function sendTenantInviteEmail({ to, landlordName, propertyName, unitNumber, inviteLink, monthlyRent }) {
  const subject = `You are invited to join ${propertyName} (Unit ${unitNumber}) on RentPulse`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #15803d; margin-top: 0;">Welcome to RentPulse!</h2>
      <p>Hello,</p>
      <p>Your landlord, <strong>${landlordName}</strong>, has invited you to set up your tenant portal for:</p>
      <div style="background-color: #f8fafc; padding: 16px; border-radius: 6px; margin: 16px 0;">
        <p style="margin: 4px 0;"><strong>Property:</strong> ${propertyName}</p>
        <p style="margin: 4px 0;"><strong>Unit:</strong> ${unitNumber}</p>
        <p style="margin: 4px 0;"><strong>Monthly Rent:</strong> ${monthlyRent ? Number(monthlyRent).toLocaleString() + ' RWF' : 'As per agreement'}</p>
      </div>
      <p>Click the link below to accept the invitation and activate your account:</p>
      <div style="text-align: center; margin: 24px 0;">
        <a href="${inviteLink}" style="background-color: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
          Accept Invitation & Register
        </a>
      </div>
      <p style="color: #64748b; font-size: 13px;">Or copy and paste this link in your browser:<br/><a href="${inviteLink}">${inviteLink}</a></p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
      <p style="color: #94a3b8; font-size: 12px;">RentPulse Property Management &bull; Rwanda</p>
    </div>
  `;
  const text = `You are invited by ${landlordName} to join ${propertyName} (Unit ${unitNumber}). Click here to register: ${inviteLink}`;
  return sendEmail({ to, subject, html, text });
}

/**
 * Send Landlord Approval Email
 */
async function sendLandlordApprovalEmail({ to, name }) {
  const subject = `Your RentPulse Landlord Account Has Been Approved!`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #15803d; margin-top: 0;">Account Approved</h2>
      <p>Dear ${name},</p>
      <p>Great news! The platform administrator has verified and approved your Landlord account.</p>
      <p>You can now log in to add your properties, units, invite tenants, and monitor maintenance requests.</p>
      <div style="margin: 24px 0;">
        <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/login" style="background-color: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
          Go to Landlord Dashboard
        </a>
      </div>
      <p style="color: #94a3b8; font-size: 12px;">RentPulse Admin Team</p>
    </div>
  `;
  const text = `Hello ${name}, your landlord account on RentPulse has been approved. You can now log in and manage your properties.`;
  return sendEmail({ to, subject, html, text });
}

/**
 * Send Emergency Maintenance Notification to Landlord
 */
async function sendEmergencyMaintenanceAlert({ to, landlordName, propertyName, unitNumber, summary, originalDescription }) {
  const subject = `URGENT EMERGENCY ALERT: Unit ${unitNumber} - ${propertyName}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 2px solid #ef4444; border-radius: 8px;">
      <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 12px; margin-bottom: 16px;">
        <h3 style="color: #b91c1c; margin: 0;">EMERGENCY MAINTENANCE REPORTED</h3>
      </div>
      <p>Dear ${landlordName},</p>
      <p>An emergency request has just been flagged at <strong>${propertyName} (Unit ${unitNumber})</strong>:</p>
      <p><strong>AI Summary:</strong> ${summary}</p>
      <blockquote style="background: #f1f5f9; padding: 12px; border-radius: 4px; color: #334155;">
        "${originalDescription}"
      </blockquote>
      <p style="color: #dc2626; font-weight: bold;">Please inspect this request immediately in your landlord dashboard.</p>
      <div style="margin: 20px 0;">
        <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard" style="background-color: #dc2626; color: white; padding: 12px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
          Review Emergency Request
        </a>
      </div>
    </div>
  `;
  const text = `EMERGENCY ALERT: Unit ${unitNumber} at ${propertyName}. Issue: ${summary}. Original: "${originalDescription}". Please respond immediately!`;
  return sendEmail({ to, subject, html, text });
}

/**
 * Send Rent Payment Receipt Email
 */
async function sendPaymentReceiptEmail({ to, tenantName, amount, receiptNumber, forMonth, propertyName, unitNumber }) {
  const subject = `Rent Payment Receipt: ${receiptNumber} (${forMonth})`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h3 style="color: #15803d; margin-top: 0;">Rent Payment Received</h3>
      <p>Dear ${tenantName},</p>
      <p>Thank you. Your rent payment has been officially recorded by your landlord.</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 8px 0; color: #64748b;">Receipt Number:</td><td style="padding: 8px 0; font-weight: bold;">${receiptNumber}</td></tr>
        <tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 8px 0; color: #64748b;">Property:</td><td style="padding: 8px 0;">${propertyName} (Unit ${unitNumber})</td></tr>
        <tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 8px 0; color: #64748b;">Period:</td><td style="padding: 8px 0;">${forMonth}</td></tr>
        <tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 8px 0; color: #64748b;">Amount Paid:</td><td style="padding: 8px 0; font-weight: bold; color: #15803d;">${Number(amount).toLocaleString()} RWF</td></tr>
      </table>
      <p style="color: #94a3b8; font-size: 12px;">RentPulse Automated Billing System</p>
    </div>
  `;
  const text = `Rent payment of ${amount} RWF received for ${forMonth}. Receipt: ${receiptNumber}.`;
  return sendEmail({ to, subject, html, text });
}

function getEmailAuditLog() {
  return emailAuditLog;
}

module.exports = {
  sendEmail,
  sendTenantInviteEmail,
  sendLandlordApprovalEmail,
  sendEmergencyMaintenanceAlert,
  sendPaymentReceiptEmail,
  getEmailAuditLog,
};
