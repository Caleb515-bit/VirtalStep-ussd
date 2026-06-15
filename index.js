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

// ─── GET COORDINATES ─────────────────────────────────────────
async function getCoordinates(location) {
  const encoded = encodeURIComponent(location);
  const url = `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1`;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'VitalStep-Health-App' }
  });
  const data = await response.json();
  if (data.length === 0) return null;
  return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
}

// ─── FIND NEARBY HOSPITALS ───────────────────────────────────
async function findNearbyHospitals(lat, lon) {
  const query = `
    [out:json];
    node["amenity"="hospital"](around:5000,${lat},${lon});
    out 3;
  `;
  const response = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: query
  });
  const data = await response.json();
  return data.elements;
}

// ─── SEND HOSPITAL SMS ───────────────────────────────────────
async function sendHospitalSMS(phoneNumber, hospitals, location) {
  let message = `🚨 VitalStep Emergency Alert\nNearest hospitals to ${location}:\n\n`;

  if (hospitals.length === 0) {
    message += `No hospitals found nearby. Please call 112 or go to your nearest clinic immediately.`;
  } else {
    hospitals.forEach((h, i) => {
      const name = h.tags.name || 'Hospital';
      const mapLink = `https://maps.google.com/?q=${h.lat},${h.lon}`;
      message += `${i + 1}. ${name}\n${mapLink}\n\n`;
    });
  }

  message += `Stay calm. Help is available.`;

  await sms.send({
    to: [phoneNumber],
    message: message,
    from: 'VitalStep'
  });
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
        // Store symptom result in session via text flow
        response = `CON 🚨 EMERGENCY DETECTED
${result.split('ADVICE: ')[1]}

Please type your area or town so we can find the nearest hospital for you:`;

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
      // Clean location with AI
      const cleanedLocation = await cleanLocation(rawLocation);
      console.log(`Cleaned location: ${cleanedLocation}`);

      // Get coordinates
      const coords = await getCoordinates(cleanedLocation);

      if (!coords) {
        // Try with just city name as fallback
        const cityOnly = cleanedLocation.split(',')[0] + ', Nigeria';
        const fallbackCoords = await getCoordinates(cityOnly);

        if (!fallbackCoords) {
          await sms.send({
            to: [phoneNumber],
            message: `🚨 VitalStep: Could not find hospitals for "${rawLocation}". Please call 112 or visit your nearest clinic immediately.`,
            from: 'VitalStep'
          });
          response = `END We could not locate that area. We have sent you emergency contacts via SMS. Please call 112 immediately.`;
          res.set('Content-Type', 'text/plain');
          res.send(response);
          return;
        }

        const hospitals = await findNearbyHospitals(fallbackCoords.lat, fallbackCoords.lon);
        await sendHospitalSMS(phoneNumber, hospitals, cityOnly);
      } else {
        const hospitals = await findNearbyHospitals(coords.lat, coords.lon);
        await sendHospitalSMS(phoneNumber, hospitals, cleanedLocation);
      }

      response = `END 🚨 Help is on the way!
We have sent the nearest hospitals to your phone via SMS.
Please check your messages now.
If critical, call 112 immediately.`;

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
