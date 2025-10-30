const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// Configure AWS SDK v3 client
const REGION = process.env.AWS_REGION || 'us-east-1';
const ses = new SESClient({
  region: REGION,
  // Credentials are automatically picked from env vars in v3, this explicit block
  // keeps local dev predictable and is ignored if not set
  credentials: (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY)
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      }
    : undefined,
});
const FROM_EMAIL = process.env.FROM_EMAIL;

// Validate required environment variables
if (!FROM_EMAIL) {
  console.error('❌ FROM_EMAIL environment variable is required');
  process.exit(1);
}

if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
  console.error('❌ AWS credentials are required for SES');
  process.exit(1);
} 

const AGENT_EMAILS = {
  'Nohemi Tavera': 'manager@munditravels.com',
  'Erika Reyes': 'support@munditravels.com',
  'default': 'direccion@munditravels.com'
};

// Get the agent's email, fallback to default if not found
function getAgentEmail(agentName) {
  return AGENT_EMAILS[agentName] || AGENT_EMAILS.default;
}

  // Always include this recipient
const ALWAYS_TO = ['direccion@munditravels.com', 'donotreply@munditravels.com'];

  //

// Email template
const createEmailContent = (bookingData) => {
  const { passengers, flightDetails, contactInfo, agencyInfo } = bookingData;
  
  // Format passenger details with all information
  const passengerDetails = passengers.map((p, index) => 
    `<div style="border: 1px solid #ddd; padding: 15px; margin: 10px 0; border-radius: 8px; background: #f9f9f9;">
      <h4 style="margin: 0 0 10px 0; color: #333;">Pasajero ${index + 1}</h4>
      <table style="width: 100%; border-collapse: collapse;">
        <tr><td style="padding: 5px; font-weight: bold; width: 30%;">Tratamiento:</td><td style="padding: 5px;">${p.treatment || 'N/A'}</td></tr>
        <tr><td style="padding: 5px; font-weight: bold;">Nombre:</td><td style="padding: 5px;">${p.firstName} ${p.lastName}</td></tr>
        <tr><td style="padding: 5px; font-weight: bold;">Pasaporte:</td><td style="padding: 5px;">${p.documentNumber || p.passportNumber}</td></tr>
        <tr><td style="padding: 5px; font-weight: bold;">País emisor:</td><td style="padding: 5px;">${p.issuingCountry || 'N/A'}</td></tr>
        <tr><td style="padding: 5px; font-weight: bold;">Género:</td><td style="padding: 5px;">${p.gender === 'M' ? 'Masculino' : p.gender === 'F' ? 'Femenino' : 'N/A'}</td></tr>
        <tr><td style="padding: 5px; font-weight: bold;">Nacionalidad:</td><td style="padding: 5px;">${p.nationality || 'N/A'}</td></tr>
        <tr><td style="padding: 5px; font-weight: bold;">Fecha de nacimiento:</td><td style="padding: 5px;">${p.dob || 'N/A'}</td></tr>
      </table>
    </div>`
  ).join('');

  // Format flight details
  const flightDetailsHtml = flightDetails.segments.map((segment, index) => 
    `<div style="border: 1px solid #ddd; padding: 15px; margin: 10px 0; border-radius: 8px; background: #f0f8ff;">
      <h4 style="margin: 0 0 10px 0; color: #333;">Vuelo ${index + 1}</h4>
      <table style="width: 100%; border-collapse: collapse;">
        <tr><td style="padding: 5px; font-weight: bold; width: 30%;">Salida:</td><td style="padding: 5px;">${segment.departure.iataCode} - ${new Date(segment.departure.at).toLocaleString()}</td></tr>
        <tr><td style="padding: 5px; font-weight: bold;">Llegada:</td><td style="padding: 5px;">${segment.arrival.iataCode} - ${new Date(segment.arrival.at).toLocaleString()}</td></tr>
        <tr><td style="padding: 5px; font-weight: bold;">Aerolínea:</td><td style="padding: 5px;">${segment.carrierCode} ${segment.number || ''}</td></tr>
      </table>
    </div>`
  ).join('');

  // Agency information
  const agencyInfoHtml = agencyInfo ? `
    <div style="border: 1px solid #ddd; padding: 15px; margin: 10px 0; border-radius: 8px; background: #fff3cd;">
      <h3 style="margin: 0 0 15px 0; color: #856404;">🏢 Información de Agencia</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr><td style="padding: 5px; font-weight: bold; width: 30%;">Agente:</td><td style="padding: 5px;">${agencyInfo.agentName || 'N/A'}</td></tr>
        <tr><td style="padding: 5px; font-weight: bold;">Agencia:</td><td style="padding: 5px;">${agencyInfo.razonSocial || 'N/A'}</td></tr>
        <tr><td style="padding: 5px; font-weight: bold;">Email:</td><td style="padding: 5px;">${agencyInfo.email || 'N/A'}</td></tr>
        <tr><td style="padding: 5px; font-weight: bold;">Teléfono:</td><td style="padding: 5px;">${agencyInfo.phone || 'N/A'}</td></tr>
        <tr><td style="padding: 5px; font-weight: bold;">Ejecutivo:</td><td style="padding: 5px;">${agencyInfo.ejecutivo || 'N/A'}</td></tr>
      </table>
    </div>
  ` : '';

  return {
    subject: `Nueva cotización de vuelo - Mundi Travels Inc.`,
    text: `
NUEVA COTIZACIÓN DE VUELO
======================
🏢 MUNDI TRAVELS

📅 Fecha: ${new Date().toLocaleString()}

🏢 INFORMACIÓN DE AGENCIA
-------------------------
Agente: ${agencyInfo?.agentName || 'N/A'}
Agencia: ${agencyInfo?.razonSocial || 'N/A'}
Email: ${agencyInfo?.email || 'N/A'}
Teléfono: ${agencyInfo?.phone || 'N/A'}
Ejecutivo: ${agencyInfo?.ejecutivo || 'N/A'}

👥 PASAJEROS
------------
${passengers.map((p, index) => 
  `Pasajero ${index + 1}:
  - Tratamiento: ${p.treatment || 'N/A'}
  - Nombre: ${p.firstName} ${p.lastName}
  - Pasaporte: ${p.documentNumber || p.passportNumber}
  - País emisor: ${p.issuingCountry || 'N/A'}
  - Género: ${p.gender === 'M' ? 'Masculino' : p.gender === 'F' ? 'Femenino' : 'N/A'}
  - Nacionalidad: ${p.nationality || 'N/A'}
  - Fecha de nacimiento: ${p.dob || 'N/A'}`
).join('\n\n')}

✈️ VUELO
--------
${flightDetails.segments.map((segment, index) => 
  `Vuelo ${index + 1}:
  - Salida: ${segment.departure.iataCode} - ${new Date(segment.departure.at).toLocaleString()}
  - Llegada: ${segment.arrival.iataCode} - ${new Date(segment.arrival.at).toLocaleString()}
  - Aerolínea: ${segment.carrierCode} ${segment.number || ''}`
).join('\n\n')}

💵 Precio total: ${flightDetails.price}

¡Gracias por cotizar con Mundi Travels!`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; background: #f8f9fa; padding: 20px;">
        <div style="background: white; border-radius: 10px; padding: 30px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 30px;">
            <div style="margin-bottom: 20px;">
              <img src="cid:mundi-logo" alt="Mundi Travels" style="max-width: 200px; height: auto;" />
            </div>
            <h1 style="color: #2c3e50; margin: 0; font-size: 28px;">✈️ Nueva Cotización de Vuelo</h1>
            <p style="color: #7f8c8d; margin: 10px 0 0 0; font-size: 16px;">${new Date().toLocaleString()}</p>
          </div>
          
          ${agencyInfoHtml}
          
          <div style="margin: 30px 0;">
            <h2 style="color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px;">👥 Pasajeros (${passengers.length})</h2>
            ${passengerDetails}
          </div>
          
          <div style="margin: 30px 0;">
            <h2 style="color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px;">✈️ Detalles del Vuelo</h2>
            ${flightDetailsHtml}
          </div>
          
          <div style="background: #e8f5e8; border: 1px solid #4caf50; border-radius: 8px; padding: 20px; margin: 30px 0; text-align: center;">
            <h3 style="color: #2e7d32; margin: 0 0 10px 0;">💵 Precio Total</h3>
            <p style="font-size: 24px; font-weight: bold; color: #1b5e20; margin: 0;">${flightDetails.price}</p>
          </div>
          
          <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ecf0f1;">
            <p style="color: #7f8c8d; margin: 0;">¡Gracias por tu reserva con <strong style="color: #2c3e50;">Mundi Travels</strong>!</p>
            <p style="color: #95a5a6; margin: 10px 0 0 0; font-size: 14px;">Nuestro equipo se pondrá en contacto contigo pronto.</p>
          </div>
        </div>
      </div>
    `
  };
};

// Send email via SES
router.post('/send-booking-email', async (req, res) => {
  try {
    const bookingData = req.body;
    
    // Validate required fields
    if (!bookingData.passengers || !bookingData.flightDetails || !bookingData.contactInfo) {
      return res.status(400).json({ 
        success: false,
        error: 'Missing required booking data',
        details: 'passengers, flightDetails, and contactInfo are required'
      });
    }

    // Validate email addresses
    const agentEmail = getAgentEmail(bookingData.contactInfo.agent);
    const toAddresses = Array.from(new Set([agentEmail, ALWAYS_TO].filter(Boolean)));
    
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmails = toAddresses.filter(email => !emailRegex.test(email));
    if (invalidEmails.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email addresses',
        details: `Invalid emails: ${invalidEmails.join(', ')}`
      });
    }

    const { subject, text, html } = createEmailContent(bookingData);

    // Read logo file and convert to base64 for embedding
    let logoBase64 = null;
    try {
      const logoPath = path.join(__dirname, '..', 'Logo_MundiTravels_Nuevo-1.png');
      if (fs.existsSync(logoPath)) {
        const logoData = fs.readFileSync(logoPath);
        logoBase64 = `data:image/png;base64,${logoData.toString('base64')}`;
      }
    } catch (error) {
      console.warn('Could not load logo file:', error.message);
    }

    // Update HTML with base64 logo if available
    const htmlWithLogo = logoBase64 
      ? html.replace('src="cid:mundi-logo"', `src="${logoBase64}"`)
      : html.replace('<img src="cid:mundi-logo" alt="Mundi Travels" style="max-width: 200px; height: auto;" />', '');

    const params = {
      Destination: {
        ToAddresses: toAddresses,
        // Don't CC customer email in sandbox mode to avoid verification issues
        // CcAddresses: (bookingData.contactInfo?.email && emailRegex.test(bookingData.contactInfo.email)) 
        //   ? [bookingData.contactInfo.email] 
        //   : []
      },
      Message: {
        Body: {
          Html: { Data: htmlWithLogo, Charset: 'UTF-8' },
          Text: { Data: text, Charset: 'UTF-8' },
        },
        Subject: { Data: subject, Charset: 'UTF-8' },
      },
      Source: FROM_EMAIL,
    };

    console.log(`📧 Sending email to: ${toAddresses.join(', ')}`);
    const result = await ses.send(new SendEmailCommand(params));
    console.log('✅ Email sent successfully:', result.MessageId);
    
    res.json({ 
      success: true, 
      message: 'Booking confirmation email sent successfully',
      messageId: result.MessageId,
      recipients: toAddresses
    });
  } catch (error) {
    console.error('❌ Error sending email:', error);
    
    // Handle specific AWS SES errors
    let errorMessage = 'Failed to send booking confirmation email';
    let statusCode = 500;
    
    if (error.name === 'MessageRejected') {
      errorMessage = 'Email was rejected by AWS SES';
      statusCode = 400;
    } else if (error.name === 'MailFromDomainNotVerifiedException') {
      errorMessage = 'FROM_EMAIL domain not verified in AWS SES';
      statusCode = 400;
    } else if (error.name === 'ConfigurationSetDoesNotExistException') {
      errorMessage = 'SES configuration error';
      statusCode = 500;
    }
    
    res.status(statusCode).json({ 
      success: false, 
      error: errorMessage,
      details: error.message,
      code: error.name
    });
  }
});

module.exports = router;
