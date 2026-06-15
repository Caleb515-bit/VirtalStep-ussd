const AfricasTalking = require('africastalking');
const at = AfricasTalking({
  apiKey: process.env.AT_API_KEY,
  username: 'sandbox'
});
const sms = at.SMS;
const express = require('express');
const app = express();
app.use(express.urlencoded({ extended: false }));

// ─── AI TRIAGE ───────────────────────────────────────────────
async function askGroq(symptoms) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages: [{
        role: 'user',
        content: `You are a strict health triage assistant. You ONLY respond to health symptoms and medical complaints.
If the input is NOT a health symptom, respond exactly with:
LEVEL: INVALID
ADVICE: Please describe your health symptom. Example: fever, chest pain, headache.
If it IS a health symptom, respond exactly with:
LEVEL: [EMERGENCY / URGENT / LOW RISK]
ADVICE: [one sentence of safe health advice]
User input: "${symptoms}"`
      }]
    })
  });
  const data = await response.json();
  return data.choices[0].message.content;
}

// ─── CLEAN LOCATION WITH AI ──────────────────────────────────
async function cleanLocation(rawLocation) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages: [{
        role: 'user',
        content: `You are a location name corrector for Nigeria.
The user typed a location name that may be misspelled or in a local language.
Correct it to the proper English place name in Nigeria.
Only respond with the corrected place name followed by ", Nigeria". Nothing else.
Example: "lagoos" -> "Lagos, Nigeria"
Example: "eko" -> "Lagos, Nigeria"
Example: "Baptiist avenus lagos" -> "Baptist Avenue, Lagos, Nigeria"
User input: "${rawLocation}"`
      }]
    })
  });
  const data = await response.json();
  return data.choices[0].message.content.trim();
}

// ─── SEND HOSPITAL SMS ───────────────────────────────────────
async function sendHospitalSMS(phoneNumber, cleanedLocation) {
  const searchQuery = encodeURIComponent(`hospitals near ${cleanedLocation}`);
  const mapLink = `https://maps.google.com/maps?q=${searchQuery}`;

  const message = `VitalStep Emergency Alert\n\nFind hospitals near you:\n${mapLink}\n\nAlso call 112 immediately.\nStay calm, help is available.`;

  try {
    const result = await sms.send({
      to: [phoneNumber],
      message: message
    });
    console.log('SMS result:', JSON.stringify(result));
  } catch (err) {
    console.error('SMS send error:', err.message);
    throw err;
  }
}

// ─── USSD HANDLER ────────────────────────────────────────────
app.post('/ussd', async (req, res) => {
  const { text, phoneNumber } = req.body;
  const steps = text.split('*');
  let response = '';

  // Step 1 — Welcome
  if (text === '') {
    response = `CON Welcome to VitalStep Health Line.
Please describe your main symptom briefly.
Example: fever, chest pain, bleeding`;

  // Step 2 — Got symptom, check with AI
  } else if (steps.length === 1) {
    try {
      const result = await askGroq(text);

      if (result.includes('LEVEL: INVALID')) {
        response = `CON ${result.split('ADVICE: ')[1]}`;
      } else if (result.includes('LEVEL: EMERGENCY')) {
        response = `CON EMERGENCY DETECTED
${result.split('ADVICE: ')[1]}

Type your area or town to get nearest hospitals via SMS:`;
      } else {
        response = `END ${result}`;
      }

    } catch (err) {
      console.error('Groq error:', err.message);
      response = `END Sorry, service unavailable. If emergency, go to hospital immediately.`;
    }

  // Step 3 — Got location after emergency
  } else if (steps.length === 2) {
    const rawLocation = steps[1];

    try {
      const cleanedLocation = await cleanLocation(rawLocation);
      console.log(`Cleaned location: ${cleanedLocation}`);
      console.log(`Sending SMS to: ${phoneNumber}`);

      await sendHospitalSMS(phoneNumber, cleanedLocation);

      response = `END Help is on the way!
Check your SMS for nearby hospitals.
Call 112 immediately if critical.`;

    } catch (err) {
      console.error('Location/SMS error:', err.message);
      response = `END Service error. Please call 112 or go to your nearest hospital immediately.`;
    }
  }

  res.set('Content-Type', 'text/plain');
  res.send(response);
});

// ─── SERVER ──────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`VitalStep running on port ${PORT}`));
