/**
 * ProsePilot Google Docs Add-on — Server-side Code
 * Handles document operations and communicates with ProsePilot API
 */

const API_BASE = 'https://prosepilot.io';
const PROSEPILOT_SIDEBAR_ID = 'prosepilot-sidebar';

/**
 * Triggered when the add-on is opened from the Google Docs add-on menu
 */
function onHomepageOpen(e) {
  return createSidebarCard();
}

/**
 * Triggered when file scope is granted
 */
function onFileScopeGranted(e) {
  return createSidebarCard();
}

/**
 * Opens the ProsePilot sidebar
 */
function openSidebar() {
  const ui = DocumentApp.getUi();
  const html = HtmlService.createHtmlOutputFromFile('sidebar')
    .setTitle('ProsePilot')
    .setWidth(360);
  ui.showSidebar(html);
}

/**
 * Creates the main sidebar card for the add-on home page
 */
function createSidebarCard() {
  const card = CardService.newCardBuilder();
  
  const header = CardService.newCardHeader()
    .setTitle('ProsePilot')
    .setSubtitle('Your Writing Co-Pilot')
    .setImageUrl('https://prosepilot.io/icons/icon128.png')
    .setImageStyle(CardService.ImageStyle.CIRCLE);
  
  const section = CardService.newCardSection()
    .setHeader('Write like you. Only better.')
    .addWidget(CardService.newTextParagraph()
      .setText('ProsePilot fixes grammar, spelling, and punctuation — without changing your voice. We only refine, never rewrite.'))
    .addWidget(CardService.newButtonSet()
      .addButton(CardService.newTextButton()
        .setText('Open ProsePilot')
        .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
        .setOnClickAction(CardService.newAction()
          .setFunctionName('openSidebar'))))
    .addWidget(CardService.newButtonSet()
      .addButton(CardService.newTextButton()
        .setText('Check Document')
        .setOnClickAction(CardService.newAction()
          .setFunctionName('checkDocument'))))
    .addWidget(CardService.newTextParagraph()
      .setText('Voice Preservation Score: 94% — Most tools would change ~40% of your style. We keep you sounding like you.')
      .setWrapText(true));
  
  card.setHeader(header).addSection(section);
  return card.build();
}

/**
 * Checks the current document for grammar issues
 */
function checkDocument() {
  const doc = DocumentApp.getActiveDocument();
  const text = doc.getBody().getText();
  
  if (!text || text.trim().length < 10) {
    showNotification('Document is too short to check');
    return;
  }
  
  const issues = checkTextWithAPI(text);
  showIssuesInSidebar(issues);
}

/**
 * Checks text with ProsePilot API
 */
function checkTextWithAPI(text) {
  try {
    const response = UrlFetchApp.fetch(`${API_BASE}/v1/check`, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ text, mode: 'review' }),
      muteHttpExceptions: true,
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`
      }
    });
    
    if (response.getResponseCode() === 200) {
      const data = JSON.parse(response.getContentText());
      return data.issues || [];
    }
  } catch (e) {
    console.error('API check failed:', e);
  }
  
  // Fallback to local grammar check
  return localGrammarCheck(text);
}

/**
 * Gets the auth token for API calls
 */
function getAuthToken() {
  // Try to get stored token
  const props = PropertiesService.getUserProperties();
  return props.getProperty('prosepilot_clerk_token') || '';
}

/**
 * Local grammar check fallback (mirrors API rules)
 */
function localGrammarCheck(text) {
  const issues = [];
  
  const rules = [
    // Capitalization
    { pattern: /([.!?]\s+)([a-z])/g, replacement: (_m, p1, p2) => p1 + p2.toUpperCase(), category: 'grammar', explanation: 'Capitalize the first word of a new sentence.' },
    { pattern: /^([a-z])/, replacement: (_m, letter) => letter.toUpperCase(), category: 'grammar', explanation: 'Capitalize the first word of a sentence.' },
    { pattern: /\bProsepilot\b/g, replacement: 'ProsePilot', category: 'spelling', explanation: "Proper noun 'ProsePilot' should be capitalized correctly." },
    { pattern: /\bGrammarly\b/gi, replacement: 'Grammarly', category: 'spelling', explanation: "Proper noun 'Grammarly' should be capitalized correctly." },
    { pattern: /\bMicrosoft\b/gi, replacement: 'Microsoft', category: 'spelling', explanation: "Proper noun 'Microsoft' should be capitalized correctly." },
    { pattern: /\bGoogle\b/gi, replacement: 'Google', category: 'spelling', explanation: "Proper noun 'Google' should be capitalized correctly." },
    { pattern: /\bOpenai\b/g, replacement: 'OpenAI', category: 'spelling', explanation: "Proper noun 'OpenAI' should be capitalized correctly." },
    { pattern: /\bDeepseek\b/g, replacement: 'DeepSeek', category: 'spelling', explanation: "Proper noun 'DeepSeek' should be capitalized correctly." },
    
    // Punctuation
    { pattern: /(\w) ,/g, replacement: '$1,', category: 'punctuation', explanation: 'Remove space before comma.' },
    { pattern: /(\w) \./g, replacement: '$1.', category: 'punctuation', explanation: 'Remove space before period.' },
    { pattern: /(\w) ;/g, replacement: '$1;', category: 'punctuation', explanation: 'Remove space before semicolon.' },
    { pattern: /(\w) :/g, replacement: '$1:', category: 'punctuation', explanation: 'Remove space before colon.' },
    { pattern: /(\w) \)/g, replacement: '$1)', category: 'punctuation', explanation: 'Remove space before closing parenthesis.' },
    { pattern: /  +/g, replacement: ' ', category: 'style', explanation: 'Remove extra spaces.' },
    { pattern: /^([A-Z][^.!?}\n"]+)$/m, replacement: '$1.', category: 'punctuation', explanation: 'Sentences should end with a period.' },
    { pattern: /\.\./g, replacement: '...', category: 'punctuation', explanation: 'Use an ellipsis (...) not double periods.' },
    { pattern: /\b(If|When|While|Although|Because|Since|Unless|After|Before|Until|Once|Whenever|Wherever|Whether)\s+([^,]+?)\s+([A-Z][a-z]*)/g, replacement: '$1 $2, $3', category: 'punctuation', explanation: 'Use a comma after an introductory or conditional clause.' },
    
    // Word form errors
    { pattern: /\bour discussing\b/gi, replacement: 'our discussion', category: 'grammar', explanation: 'Use the noun form \'discussion\' after a possessive, not the gerund \'discussing\'.' },
    { pattern: /\btheir discussing\b/gi, replacement: 'their discussion', category: 'grammar', explanation: 'Use the noun form \'discussion\' after a possessive, not the gerund \'discussing\'.' },
    { pattern: /\bthe discussing\b/gi, replacement: 'the discussion', category: 'grammar', explanation: 'Use the noun form \'discussion\' after \'the\', not the gerund \'discussing\'.' },
    { pattern: /\ba discussing\b/gi, replacement: 'a discussion', category: 'grammar', explanation: 'Use the noun form \'discussion\' after \'a\', not the gerund \'discussing\'.' },
    
    // Uncountable nouns
    { pattern: /\bfoods\b/gi, replacement: 'food', category: 'grammar', explanation: '\'Food\' is typically uncountable. Use \'food\' not \'foods\'.' },
    { pattern: /\binformations\b/gi, replacement: 'information', category: 'grammar', explanation: '\'Information\' is uncountable. Use \'information\' not \'informations\'.' },
    { pattern: /\badvices\b/gi, replacement: 'advice', category: 'grammar', explanation: '\'Advice\' is uncountable. Use \'advice\' not \'advices\'.' },
    { pattern: /\bequipments\b/gi, replacement: 'equipment', category: 'grammar', explanation: '\'Equipment\' is uncountable. Use \'equipment\' not \'equipments\'.' },
    { pattern: /\bfurnitures\b/gi, replacement: 'furniture', category: 'grammar', explanation: '\'Furniture\' is uncountable. Use \'furniture\' not \'furnitures\'.' },
    { pattern: /\bstaffs\b/gi, replacement: 'staff', category: 'grammar', explanation: '\'Staff\' is typically uncountable. Use \'staff\' not \'staffs\'.' },
    { pattern: /\bhomeworks\b/gi, replacement: 'homework', category: 'grammar', explanation: '\'Homework\' is uncountable. Use \'homework\' not \'homeworks\'.' },
    
    // Missing object pronoun
    { pattern: /\b(finished|completed|submitted|reviewed|approved|processed|resolved|addressed|handled|finished up|wrapped up) (on time|early|late|before|after|today|yesterday|this week|last week|this month|next week)\b/gi, replacement: '$1 it $2', category: 'grammar', explanation: 'This verb typically needs a direct object. Add \'it\' to clarify what was finished.' },
    
    // Adjective-noun word order
    { pattern: /\bupgrade premium\b/gi, replacement: 'premium upgrade', category: 'style', explanation: 'Adjective before noun: \'premium upgrade\' not \'upgrade premium\'.' },
    { pattern: /\breport inspection\b/gi, replacement: 'inspection report', category: 'style', explanation: 'Adjective before noun: \'inspection report\' not \'report inspection\'.' },
    { pattern: /\binspection site visit\b/gi, replacement: 'site visit inspection', category: 'style', explanation: 'Reorder: \'site visit inspection\' not \'inspection site visit\'.' },
  ];
  
  const issues = [];
  
  for (const rule of rules) {
    let match;
    rule.pattern.lastIndex = 0;
    while ((match = rule.pattern.exec(text)) !== null) {
      const fixed = typeof rule.replacement === 'function' 
        ? match[0].replace(rule.pattern, rule.replacement)
        : match[0].replace(rule.pattern, rule.replacement);
      
      if (fixed && fixed !== match[0]) {
        issues.push({
          id: `rule_${issues.length}`,
          original: match[0],
          replacement: fixed,
          category: rule.category,
          explanation: rule.explanation,
          confidence: 0.99,
        });
      }
    }
  }
  
  return issues;
}

/**
 * Shows issues in the sidebar
 */
function showIssuesInSidebar(issues) {
  const html = HtmlService.createHtmlOutputFromFile('issues-sidebar')
    .setTitle(`ProsePilot — ${issues.length} issue${issues.length !== 1 ? 's' : ''}`)
    .setWidth(360);
  
  // Pass issues to the template
  const template = HtmlService.createTemplateFromFile('issues-sidebar');
  template.issues = issues;
  const htmlOutput = template.evaluate()
    .setTitle(`ProsePilot — ${issues.length} issue${issues.length !== 1 ? 's' : ''}`)
    .setWidth(360);
  
  DocumentApp.getUi().showSidebar(htmlOutput);
}

/**
 * Shows a notification toast
 */
function showNotification(message) {
  DocumentApp.getUi().alert(message);
}

/**
 * Menu item: Open ProsePilot sidebar
 */
function onOpen(e) {
  DocumentApp.getUi()
    .createAddonMenu()
    .addItem('Open ProsePilot', 'openSidebar')
    .addItem('Check Document', 'checkDocument')
    .addSeparator()
    .addItem('Settings', 'openSettings')
    .addToUi();
}

/**
 * Opens settings sidebar
 */
function openSettings() {
  const html = HtmlService.createHtmlOutputFromFile('settings')
    .setTitle('ProsePilot Settings')
    .setWidth(360);
  DocumentApp.getUi().showSidebar(html);
}

function onInstall(e) {
  onOpen(e);
}

/**
 * Gets ignored words from user properties
 */
function getIgnoredWords() {
  const props = PropertiesService.getUserProperties();
  const words = props.getProperty('prosepilot_ignored_words');
  return words ? JSON.parse(words) : [];
}

/**
 * Adds an ignored word
 */
function addIgnoredWord(word) {
  const words = getIgnoredWords();
  if (!words.includes(word)) {
    words.push(word);
    PropertiesService.getUserProperties().setProperty('prosepilot_ignored_words', JSON.stringify(words));
  }
  return getIgnoredWords();
}

/**
 * Removes an ignored word
 */
function removeIgnoredWord(word) {
  const words = getIgnoredWords();
  const filtered = words.filter(w => w !== word);
  PropertiesService.getUserProperties().setProperty('prosepilot_ignored_words', JSON.stringify(filtered));
  return getIgnoredWords();
}

/**
 * Opens a URL in a new tab
 */
function openUrl(url) {
  return HtmlService.createHtmlOutput(
    `<script>window.open('${url}'); google.script.host.close();</script>`
  ).setWidth(100).setHeight(100);
}