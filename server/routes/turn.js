const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (accountSid && authToken) {
      // Fetch dynamic TURN credentials from Twilio
      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Tokens.json`, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
        }
      });
      
      const data = await response.json();
      if (data && data.ice_servers) {
        return res.json({ iceServers: data.ice_servers });
      }
    }

    // Fallback to Public Free OpenRelay / Google STUN
    const fallbackServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: "stun:openrelay.metered.ca:80" },
      {
        urls: "turn:openrelay.metered.ca:80",
        username: "openrelayproject",
        credential: "openrelayproject",
      },
      {
        urls: "turn:openrelay.metered.ca:443",
        username: "openrelayproject",
        credential: "openrelayproject",
      },
      {
        urls: "turn:openrelay.metered.ca:443?transport=tcp",
        username: "openrelayproject",
        credential: "openrelayproject",
      }
    ];

    res.json({ iceServers: fallbackServers });
  } catch (error) {
    console.error('[TURN API] Error fetching Twilio tokens:', error);
    res.status(500).json({ error: 'Failed to fetch ICE servers' });
  }
});

module.exports = router;
