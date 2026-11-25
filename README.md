# SilentTalk

**AI-Powered Two-Way Communication Using Indian Sign Language Recognition and Tulu Translation**

SilentTalk is a browser-based communication application designed to bridge the communication gap between Deaf and hearing individuals using Indian Sign Language (ISL), Tulu translation, and speech technologies.

## Key Features

- **ISL Recognition:** Recognizes hand gestures using webcam input and MediaPipe Hands.
- **Tulu Translation:** Converts recognized English sign labels into Tulu text written in Kannada script.
- **Speech Output:** Reads translated text aloud using browser text-to-speech.
- **Speech-to-Text:** Converts spoken input into text using browser speech recognition and Whisper.
- **Two-Way Communication:** Supports sign-to-text/speech and speech-to-text communication.

## Technologies Used

- HTML, CSS, JavaScript
- MediaPipe Hands
- K-Nearest Neighbors (KNN)
- Transformers.js
- Whisper Tiny
- Web Speech API

## How It Works

### Sign Language to Tulu
1. Capture hand gestures through the webcam.
2. Extract hand landmarks using MediaPipe Hands.
3. Compare the detected gesture with stored gesture samples.
4. Predict the corresponding sign.
5. Translate the recognized sign into Tulu.
6. Display the translated text and generate speech output.

### Speech to Text
1. Capture speech through the microphone.
2. Process the speech using browser speech recognition or Whisper.
3. Display the recognized text on the application.

## Dataset

The project uses a custom dataset containing **1,272 video clips across 42 sign classes**.

## Running the Project

1. Clone the repository:
   ```bash
   git clone https://github.com/kavya-06-b/SilentTalk-Two-Way-Communication-Using-Indian-Sign-Language-and-Speech-Recognition.git
   ```
2. Open the project folder.
3. Start a local server:
   ```bash
   python -m http.server 8080
   ```
4. Open `http://localhost:8080` in Chrome or Edge.
5. Allow camera and microphone permissions.

## Project Structure

```text
SilentTalk/
├── index.html
├── css/
├── js/
├── model/
├── tools/
└── README.md
```

## Future Improvements

- Improve recognition accuracy across different signers.
- Expand the ISL gesture dataset.
- Improve sentence-level Tulu translation.
- Enhance multilingual speech recognition.
- Add support for more regional languages.

## Academic Project

Developed as an Artificial Intelligence and Machine Learning project.

**SilentTalk – Breaking Communication Barriers Through AI.**