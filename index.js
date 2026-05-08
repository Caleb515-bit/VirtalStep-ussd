const express = require('express');
const app = express();
app.use(express.urlencoded({ extended: false }));

app.post('/ussd', (req, res) => {
  const { text } = req.body;
  let response = '';

  if (text === '') {
    response = `CON Welcome to iCare Health Line.
Are you having difficulty breathing?
1. Yes
2. No`;

  } else if (text === '1') {
    response = `END EMERGENCY: Please go to the nearest hospital immediately. Call for help now.`;

  } else if (text === '2') {
    response = `CON Do you have chest pain?
1. Yes
2. No`;

  } else if (text === '2*1') {
    response = `END EMERGENCY: Chest pain is serious. Go to the nearest hospital immediately.`;

  } else if (text === '2*2') {
    response = `CON Are you bleeding heavily?
1. Yes
2. No`;

  } else if (text === '2*2*1') {
    response = `END EMERGENCY: Apply pressure to the wound and go to hospital immediately.`;

  } else if (text === '2*2*2') {
    response = `CON Do you have a high fever?
1. Yes
2. No`;

  } else if (text === '2*2*2*1') {
    response = `CON How long have you had the fever?
1. Less than 2 days
2. More than 2 days`;

  } else if (text === '2*2*2*1*1') {
    response = `END URGENT: Visit a clinic within 24 hours. Drink plenty of water and rest.`;

  } else if (text === '2*2*2*1*2') {
    response = `END URGENT: Fever lasting over 2 days needs a doctor. Visit a clinic today.`;

  } else if (text === '2*2*2*2') {
    response = `CON Do you have severe vomiting or diarrhea?
1. Yes
2. No`;

  } else if (text === '2*2*2*2*1') {
    response = `END URGENT: Visit a clinic soon. Drink water to avoid dehydration.`;

  } else if (text === '2*2*2*2*2') {
    response = `END LOW RISK: Your symptoms seem mild. Rest, drink water, monitor yourself. Visit a clinic if it gets worse.`;

  } else {
    response = `END Thank you for using iCare. Stay safe.`;
  }

  res.set('Content-Type', 'text/plain');
  res.send(response);
});

app.listen(3000, () => console.log('iCare running on port 3000'));