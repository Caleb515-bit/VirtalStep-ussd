const AfricasTalking = require('africastalking');
const at = AfricasTalking({
  apiKey: process.env.AT_API_KEY,
  username: 'sandbox'
});
const voice = at.VOICE;
const express = require('express');
const app = express();
app.use(express.urlencoded({ extended: false }));

async function askGemini(symptoms) {
  const response = await fetch(
    'https://api.groq.com/openai/v1/chat/completions',
    {
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
    }
  );
  const data = await response.json();
  console.log('Groq response:', JSON.stringify(data));
  return data.choices[0].message.content;
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
if (result.includes('LEVEL: INVALID')) {
  response = `CON ${result.split('ADVICE: ')[1]}`;
} else {
  response = `END ${result}`;
}
    } catch (err) {
    console.error('Gemini error:', err.message);
    response = `END Sorry, service unavailable. If emergency, go to hospital immediately.`;
  }
  }

  res.set('Content-Type', 'text/plain');
  res.send(response);
});

app.get('/test-call', async (req, res) => {
  try {
    const result = await voice.call({
      callFrom: '+2547000000000',
      callTo: ['+2348122767290'],
      clientRequestId: 'icare-test',
    });
    res.send(result);
  } catch (err) {
    res.send('Error: ' + err.message);
  }
});

const PORT = process.env.PORT || 3000;
app.post('/voice', async (req, res) => {
  const { dtmfDigits, text } = req.body;

  let response = '';

  if (!dtmfDigits) {
    response = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <GetDigits timeout="30" finishOnKey="#" callbackUrl="https://icare-ussd.onrender.com/voice-answer">
    <Say>Welcome to VitalStep Health Guidance Line. Please describe your symptom after the beep, then press hash.</Say>
  </GetDigits>
  <Say>We did not receive your input. Please call again.</Say>
</Response>`;
  }

  res.set('Content-Type', 'text/xml');
  res.send(response);
});

app.post('/voice-answer', async (req, res) => {
  const { dtmfDigits } = req.body;

  try {
    const result = await askGemini(dtmfDigits || 'unknown symptoms');
    response = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>${result}</Say>
</Response>`;
  } catch (err) {
    response = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Sorry, service is unavailable. If this is an emergency, please go to your nearest hospital immediately.</Say>
</Response>`;
  }

  res.set('Content-Type', 'text/xml');
  res.send(response);
});
app.listen(PORT, () => console.log(`iCare running on port ${PORT}`));
