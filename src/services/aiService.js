/**
 * AI Maintenance Triage and Property Assistant Service
 * Adheres strictly to the MVP specification:
 * - Fixed JSON format
 * - Categories: plumbing, electrical, doors and locks, appliances, structure (roof, walls, windows), pests, other
 * - Urgency: low, normal, urgent
 * - Emergency detection (112 alerts)
 * - Safe: Never instructs tenant how to repair
 * - Resilient: Falls back gracefully to { category: "other", urgency: "normal" } if call fails
 * - Multilingual support (English, Kinyarwanda, French)
 */

const ALLOWED_CATEGORIES = [
  'plumbing',
  'electrical',
  'doors and locks',
  'appliances',
  'structure (roof, walls, windows)',
  'pests',
  'other',
];

const ALLOWED_URGENCIES = ['low', 'normal', 'urgent'];

/**
 * Smart multilingual rule-based classifier (guaranteed fallback & instant baseline)
 */
function localRuleBasedTriage(text) {
  const lower = (text || '').toLowerCase();

  let category = 'other';
  let urgency = 'normal';
  let is_emergency = false;
  let summary = text.length > 90 ? text.substring(0, 90) + '...' : text;
  let follow_up_question = 'Could you specify the room and how long this issue has been happening?';

  // 1. Emergency detection
  const emergencyKeywords = [
    'gas', 'gas smell', 'smell gas', 'impumuro ya gazi', 'gazi',
    'smoke', 'fire', 'inkongi', 'umuriro ukomeye', 'flames',
    'sparks', 'sparking', 'ibishashi', 'shock', 'electric shock',
    'serious flood', 'burst pipe', 'amazi menshi cyane', 'umwuzure',
    'ceiling collapsed', 'roof collapse', 'igisenge cyaguye'
  ];

  const hasEmergency = emergencyKeywords.some(kw => lower.includes(kw));

  // 2. Category detection
  if (
    lower.includes('leak') || lower.includes('water') || lower.includes('pipe') ||
    lower.includes('sink') || lower.includes('toilet') || lower.includes('drain') ||
    lower.includes('faucet') || lower.includes('tap') || lower.includes('shower') ||
    lower.includes('amazi') || lower.includes('kuva') || lower.includes('ruvuye') ||
    lower.includes('shinga') || lower.includes('umuyoboro') || lower.includes('plumb')
  ) {
    category = 'plumbing';
    urgency = (lower.includes('burst') || lower.includes('flood') || lower.includes('everywhere') || lower.includes('hose')) ? 'urgent' : 'normal';
    summary = 'Plumbing issue: Water leak or drainage malfunction reported.';
    follow_up_question = 'Does the water stop leaking when the main tap/valve is turned off?';
  } else if (
    lower.includes('spark') || lower.includes('outlet') || lower.includes('socket') ||
    lower.includes('power') || lower.includes('breaker') || lower.includes('light') ||
    lower.includes('wire') || lower.includes('electric') || lower.includes('umuriro') ||
    lower.includes('amashanyarazi') || lower.includes('itara') || lower.includes('prise')
  ) {
    category = 'electrical';
    urgency = (lower.includes('spark') || lower.includes('smoke') || lower.includes('blackout') || lower.includes('shock')) ? 'urgent' : 'normal';
    summary = 'Electrical system issue: Power, wiring or outlet concern.';
    follow_up_question = 'Are any other switches or rooms in the unit affected?';
  } else if (
    lower.includes('door') || lower.includes('lock') || lower.includes('key') ||
    lower.includes('handle') || lower.includes('hinge') || lower.includes('latch') ||
    lower.includes('urugi') || lower.includes('umuryango') || lower.includes('ingufuri') ||
    lower.includes('urufunguzo') || lower.includes('porte') || lower.includes('serrure')
  ) {
    category = 'doors and locks';
    urgency = (lower.includes('cannot lock') || lower.includes('stuck inside') || lower.includes('broken lock') || lower.includes('security')) ? 'urgent' : 'low';
    summary = 'Access issue: Door, lock or handle difficulty reported.';
    follow_up_question = 'Is the door currently able to be locked securely from the outside?';
  } else if (
    lower.includes('fridge') || lower.includes('refrigerator') || lower.includes('stove') ||
    lower.includes('oven') || lower.includes('washer') || lower.includes('dryer') ||
    lower.includes('microwave') || lower.includes('heater') || lower.includes('ac') ||
    lower.includes('firigo') || lower.includes('ifuru') || lower.includes('imashini') ||
    lower.includes('appliance')
  ) {
    category = 'appliances';
    urgency = lower.includes('fridge') ? 'normal' : 'low';
    summary = 'Appliance breakdown: Equipment not functioning as expected.';
    follow_up_question = 'Does the appliance turn on at all or make unusual noises when powered?';
  } else if (
    lower.includes('roof') || lower.includes('ceiling') || lower.includes('wall') ||
    lower.includes('window') || lower.includes('crack') || lower.includes('tile') ||
    lower.includes('igisenge') || lower.includes('urukuta') || lower.includes('idirishya') ||
    lower.includes('amabati') || lower.includes('structure') || lower.includes('toit')
  ) {
    category = 'structure (roof, walls, windows)';
    urgency = (lower.includes('collapse') || lower.includes('broken glass') || lower.includes('crack')) ? 'urgent' : 'normal';
    summary = 'Structural concern: Roof, ceiling, wall or window issue reported.';
    follow_up_question = 'Is there any visible debris falling, or does it worsen during rain?';
  } else if (
    lower.includes('pest') || lower.includes('rat') || lower.includes('mouse') ||
    lower.includes('mice') || lower.includes('cockroach') || lower.includes('roach') ||
    lower.includes('bug') || lower.includes('ant') || lower.includes('termite') ||
    lower.includes('imbeba') || lower.includes('inyenzi') || lower.includes('amasazi') ||
    lower.includes('ubuheri')
  ) {
    category = 'pests';
    urgency = 'normal';
    summary = 'Pest activity reported within the living unit.';
    follow_up_question = 'In which room have you noticed the pest activity the most?';
  }

  // Handle emergencies
  if (hasEmergency) {
    is_emergency = true;
    urgency = 'urgent';
    summary = 'EMERGENCY: Immediate safety risk identified (' + summary + ')';
    follow_up_question = 'Are you in a safe location away from the immediate hazard?';
  }

  return {
    category,
    urgency,
    is_emergency,
    summary,
    follow_up_question,
  };
}

/**
 * Triage maintenance request with LLM (Gemini or OpenAI) with guaranteed safe fallback
 */
async function triageMaintenanceRequest(description) {
  if (!description || typeof description !== 'string') {
    return {
      category: 'other',
      urgency: 'normal',
      is_emergency: false,
      summary: 'No description provided',
      follow_up_question: 'Could you describe the problem in detail?',
    };
  }

  const prompt = `You are an AI maintenance triage assistant for a residential rental property platform.
Analyze this maintenance problem submitted by a tenant in their own words:
"""${description}"""

Return a STRICT JSON object only (no markdown, no backticks, no extra text) with the following exact keys:
{
  "category": "plumbing" | "electrical" | "doors and locks" | "appliances" | "structure (roof, walls, windows)" | "pests" | "other",
  "urgency": "low" | "normal" | "urgent",
  "is_emergency": boolean,
  "summary": "Clear, concise 1-2 sentence English summary of the issue for the landlord",
  "follow_up_question": "A polite, relevant question to ask the tenant to clarify details"
}

STRICT RULES:
1. is_emergency MUST be true if there is a gas smell or leak, smoke, fire, sparks or burning smell from sockets/wiring, severe flooding/burst main pipe, carbon monoxide, or risk of structural collapse.
2. If is_emergency is true, urgency MUST be "urgent".
3. NEVER instruct the tenant how to repair or touch anything (especially gas, electricity, or structural elements).
4. The tenant's original words may be in English, Kinyarwanda, or French. Understand any language and provide the summary in clear English.
5. Only return the raw JSON object.`;

  // Try Gemini API if key is set
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (geminiApiKey) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.1,
              responseMimeType: 'application/json',
            },
          }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        const rawContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawContent) {
          const parsed = JSON.parse(rawContent.trim().replace(/^```json/, '').replace(/```$/, ''));
          return sanitizeTriageOutput(parsed, description);
        }
      }
    } catch (err) {
      console.warn('Gemini API call failed, trying secondary fallback:', err.message);
    }
  }

  // Try OpenAI API if key is set
  const openAiApiKey = process.env.OPENAI_API_KEY;
  if (openAiApiKey) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openAiApiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          response_format: { type: 'json_object' },
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) {
          const parsed = JSON.parse(content);
          return sanitizeTriageOutput(parsed, description);
        }
      }
    } catch (err) {
      console.warn('OpenAI API call failed:', err.message);
    }
  }

  // Guaranteed fallback: local multilingual rule-based triage
  try {
    return localRuleBasedTriage(description);
  } catch (err) {
    console.error('Local rule triage error:', err);
    return {
      category: 'other',
      urgency: 'normal',
      is_emergency: false,
      summary: description.slice(0, 100),
      follow_up_question: 'Could you give us more details about what is happening?',
    };
  }
}

/**
 * Validate and sanitize LLM output against the allowed enums and safety constraints
 */
function sanitizeTriageOutput(data, rawText) {
  let category = ALLOWED_CATEGORIES.includes(data.category) ? data.category : 'other';
  let urgency = ALLOWED_URGENCIES.includes(data.urgency) ? data.urgency : 'normal';
  let is_emergency = Boolean(data.is_emergency);

  if (is_emergency) {
    urgency = 'urgent';
  }

  let summary = typeof data.summary === 'string' && data.summary.trim()
    ? data.summary.trim()
    : (rawText.length > 90 ? rawText.substring(0, 90) + '...' : rawText);

  let follow_up_question = typeof data.follow_up_question === 'string' && data.follow_up_question.trim()
    ? data.follow_up_question.trim()
    : 'Can you provide any additional observations or details?';

  // Safety filter: ensure no DIY instructions leaked in
  const forbiddenAdvice = [
    'try to tighten', 'open the breaker', 'turn the screw', 'fix it yourself',
    'use tape', 'wire it', 'replace the fuse', 'light a match'
  ];
  if (forbiddenAdvice.some(phrase => summary.toLowerCase().includes(phrase))) {
    summary = 'Maintenance issue requiring technician inspection.';
  }

  return {
    category,
    urgency,
    is_emergency,
    summary,
    follow_up_question,
  };
}

/**
 * Stretch Goal: AI-written listing description for an empty unit
 */
async function generateListingDescription({ unitNumber, bedrooms, bathrooms, squareFeet, monthlyRent, amenities, propertyName, city }) {
  const prompt = `Write an attractive, professional 2-3 sentence rental listing description for an available apartment unit:
- Property: ${propertyName || 'Modern Residence'} in ${city || 'Kigali'}
- Unit: ${unitNumber || 'Available Unit'}
- Layout: ${bedrooms} Bedroom(s), ${bathrooms} Bathroom(s), approx ${squareFeet || 600} sq ft
- Monthly Rent: ${monthlyRent ? monthlyRent.toLocaleString() : 'Competitive'}
- Features/Amenities: ${amenities && amenities.length ? amenities.join(', ') : 'Bright natural light, modern finishes, secure access'}

Keep it appealing, inviting, and professional. Return raw text only.`;

  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (geminiApiKey) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        }
      );
      if (response.ok) {
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return text.trim();
      }
    } catch (e) {
      // fallback below
    }
  }

  // Graceful template fallback
  return `Welcome home to Unit ${unitNumber} at ${propertyName || 'our premier residence'}. Featuring ${bedrooms} spacious bedroom(s), ${bathrooms} modern bathroom(s), and ${squareFeet || 650} sq ft of thoughtfully designed living space with ${amenities && amenities.length ? amenities.join(', ') : 'great natural light and contemporary finishes'}. Available now for ${monthlyRent ? monthlyRent.toLocaleString() : ''} / month.`;
}

module.exports = {
  triageMaintenanceRequest,
  generateListingDescription,
  ALLOWED_CATEGORIES,
  ALLOWED_URGENCIES,
};
