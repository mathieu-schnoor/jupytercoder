let currentSuggestion = null;
let currentCell = null;
let suggestionBox;

async function getOpenAIKey() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "getApiKey" }, (response) => {
      resolve(response.apiKey);
    });
  });
}
// Function to send request to OpenAI API
async function sendToOpenAI(prompt) {
  const apiKey = await getOpenAIKey();
  console.log('API Key: ' + apiKey)
  if (!apiKey) {
    console.error("OpenAI API key not set.");
    return;
  }
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await response.json();
  return data.choices && data.choices[0] && data.choices[0].message.content;
}

async function getCodeCompletion(code) {
  const prompt = `
I have the following code:

\`\`\`
${code}
\`\`\`

Please provide the missing code to complete the task. (do not include code that is already present in the prompt)
`;

  // return await sendToOpenAI(prompt);
  return `\`\`\`d():
  print("Hello world");\`\`\``;
}

// Check if the current page is a Jupyter Notebook
if (document.querySelector('body.notebook_app')) {
  document.addEventListener('keydown', (event) => {
    // Check if the Ctrl + Space keys were pressed
    if (event.ctrlKey && event.code === 'Space') {
      event.preventDefault();

      // Find the active cell in the Jupyter Notebook
      const activeCell = document.querySelector('.cell.selected .input_area .CodeMirror');
      if (activeCell) {
        // Retrieve the content of the active cell
        const allCells = document.querySelectorAll('.cell .input_area .CodeMirror');
        const cellContent = getCellContent(activeCell);
        const contextContent = getPreviousCellsContent(activeCell, allCells);
        const code = contextContent + '\n' + cellContent;
        // Log the cell content to the console
        // console.log(code);

        // Suggestion handling
        // cannot handle async function like this
        getCodeCompletion(code).then((suggestion) => {
          if (suggestion) {
            console.log("[PROMPT]\n" + code)
            console.log("[RESPONSE]\n" + suggestion);
            // Use a regular expression to match the content between triple backticks
            const codeBlockRegex = /```([\s\S]*?)```/g;
            const match = codeBlockRegex.exec(suggestion);
            const extractedCode = match && match[1] ? match[1].trim() : '';
            showSuggestion(activeCell, extractedCode);
          } else {
            console.log('No suggestion received from the API.');
          }
        }).catch((error) => {
          console.error('Error:', error);
        });
      }
    }
    else if (event.code === 'Enter' && !!currentSuggestion && !!currentCell) {
      insertSuggestion(currentCell, currentSuggestion);
      hideSuggestion();
      return false;
    } else if (!event.ctrlKey && !!suggestionBox) {
      hideSuggestion();
    }
  });

  function getCellContent(cell) {
    const codeMirrorLines = cell.querySelectorAll('.CodeMirror-code pre');
    const content = [];

    codeMirrorLines.forEach((line) => {
      content.push(line.textContent);
    });

    return content.join('\n');
  }
}

function showSuggestion(cell, suggestion) {
  const cursor = cell.querySelector('.CodeMirror-cursor');
  const cursorPos = cursor.getBoundingClientRect();
  suggestionBox = document.createElement('div');
  suggestionBox.setAttribute('style', `
    position:absolute;
    background: transparent;
    color: grey;
    white-space: nowrap;
    font-family: monospace;
    font-size: 14px;
    margin-top: -1px;
    left: ${cursorPos.x}px;
    top: ${cursorPos.y}px;
  `);
  suggestionBox.innerText = suggestion;
  document.body.appendChild(suggestionBox);
  document.querySelector('#notebook').focus();
  currentCell = cell;
  currentSuggestion = suggestion;
}

function hideSuggestion() {
  document.body.removeChild(suggestionBox);
  suggestionBox = null;
  currentCell = null;
  currentSuggestion = null;
}

function insertSuggestion(cell, suggestion) {
  // Get the textarea inside the div
  const textarea = cell.querySelector('textarea');
  if (textarea) {
    // Get the current cursor position
    const cursorPosition = textarea.selectionStart;

    // Insert the suggestion at the cursor position
    const newValue = textarea.value.slice(0, cursorPosition) + suggestion + textarea.value.slice(cursorPosition);
    textarea.value = newValue;

    // Update the cursor position after inserting the suggestion
    textarea.selectionStart = textarea.selectionEnd = cursorPosition + suggestion.length;

    // Trigger a change event on the textarea to update the CodeMirror instance
    const event = new Event('input', { bubbles: true, cancelable: true });
    textarea.dispatchEvent(event);
  }
}

function getPreviousCellsContent(activeCell, allCells) {
  const previousCellsContent = [];
  let codeCellCount = 0;

  for (const cell of allCells) {
    // Stop when the active cell is reached or when three code cells have been processed
    if (cell === activeCell) break;

    // Check if the cell is a code cell
    const isCodeCell = cell.closest('.cell').classList.contains('code_cell');
    if (isCodeCell) {
      const cellContent = getCellContent(cell);
      previousCellsContent.push(cellContent); // Add the content to the end of the array
      codeCellCount++;
    }
  }

  // Reverse the array to have the content in the correct order
  const lastThreeCellsContent = previousCellsContent.slice(-3);

  return lastThreeCellsContent.join('\n');
}
