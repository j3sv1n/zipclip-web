# ZipClip Web

A clean and modern web interface for the ZipClip AI Video Shorts Generator.

## Features
- 📁 **File Upload**: Direct video file uploads (MP4, MOV, AVI, etc.)
- 🔗 **YouTube Integration**: Support for processing videos directly from YouTube URLs.
- ⚙️ **Advanced Options**: Custom processing modes, target durations, and subtitle styling.
- ⚡ **Real-time Progress**: Live status updates as the AI processes your video.
- 📜 **Job History**: Keep track of your previously generated shorts.

## Getting Started

### Prerequisites
- The ZipClip Backend must be running (normally at `http://localhost:8000`).

### Usage
1. Open `index.html` in any modern web browser.
2. Ensure the "API Online" indicator in the header is green.
3. Upload a file or paste a URL.
4. Customize your settings and click "Generate Short".

## Development
This is a vanilla HTML/CSS/JS project. No build steps are required.

## API Integration
The frontend is configured to communicate with the backend at `http://localhost:8000`. You can change this in `app.js` if your backend is hosted elsewhere.
