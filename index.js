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
        model: 'llama3-8b-8192',
        messages: [{
          role: 'user',
          content: `You are a health triage assistant. Based on these symptoms: "${symptoms}", classify urgency as one of:
- EMERGENCY: life threatening, needs hospital immediately
- URGENT: needs clinic within 24 hours
- LOW RISK: can rest at home

Reply in this exact format only:
LEVEL: [EMERGENCY/URGENT/LOW RISK]
ADVICE: [one sentence of safe advice]`
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
