const express = require('express');
const app = express();
app.use(express.urlencoded({ extended: false }));

async function askGemini(symptoms) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `You are a health triage assistant. Based on these symptoms: "${symptoms}", classify urgency as one of:
- EMERGENCY: life threatening, needs hospital immediately
- URGENT: needs clinic within 24 hours  
- LOW RISK: can rest at home

Reply in this exact format only:
LEVEL: [EMERGENCY/URGENT/LOW RISK]
ADVICE: [one sentence of safe advice]`
          }]
        }]
      })
    }
  );
  const data = await response.json();
  console.log('Gemini response:', JSON.stringify(data));
  if (!data.candidates || data.candidates.length === 0) {
    throw new Error('No candidates: ' + JSON.stringify(data));
  }
  return data.candidates[0].content.parts[0].text;
}

app.post('/ussd', async (req, res) => {
  const { text } = req.body;
  let response = '';

  if (text === '') {
    response = `CON Welcome to iCare Health Line.
Please describe your main symptom briefly.
Example: fever, chest pain, bleeding`;

  } else {
    try {
      const result = await askGemini(text);
      response = `END ${result}`;
    } catch (err) {
    console.error('Gemini error:', err.message);
    response = `END Sorry, service unavailable. If emergency, go to hospital immediately.`;
  }
  }

  res.set('Content-Type', 'text/plain');
  res.send(response);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`iCare running on port ${PORT}`));
