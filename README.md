TalkBridge – Real-time Accessible Communication Platform
TalkBridge is a real-time communication platform focused on accessibility, built to help deaf, hard-of-hearing, and speaking users communicate smoothly through chat, video calling, and AI-assisted translation.

It combines:

💬 Real-time chat
📹 Video calling (core feature)
🤟 Sign-to-speech support
🎤 Speech-to-sign support
🧠 ML-powered sign prediction panel
🚀 Main Features
1) Real-time Chat
One-to-one messaging
Live message updates
Contact list and active conversation panel
2) Video Calling (Primary Feature)
WebRTC-based peer-to-peer calling
Camera/mic controls (mute, video off, end call)
Live communication experience integrated with chat
3) AI/ML Translation Layer
Sign → Speech/Text workflow support
Speech → Sign visual support
Detection controls with confidence/probability feedback
Real-time hand detection overlay with status indicators
4) Accessibility-first Design
Built specifically to reduce communication barriers
Visual and interactive feedback for call + translation states
🛠️ Tech Stack
Frontend
HTML, CSS, JavaScript
Socket.IO client
MediaPipe Hands
Backend
Node.js
Express.js
Socket.IO
MongoDB (for user/chat related storage)
ML Service
Python-based ML service for sign prediction APIs
Integrated with frontend hand detection module
📁 Project Structure (high level)
bash
chat-app/
├── client/ (or public frontend files)
│   ├── video-core.js
│   ├── hand-detection-box.js
│   ├── sign-to-speech.js
│   ├── speech-to-sign.js
│   └── ...
├── server/
│   ├��─ controllers/
│   ├── models/
│   ├── routes/
│   ├── public/signs/
│   │   ├── alphabets/
│   │   ├── numbers/
│   │   └── words/
│   └── ...
├── ml_service/
└── .gitignore
⚙️ Setup Instructions
1. Clone repository
bash
git clone https://github.com/sumitchauhan00/DEAFtalk.git
cd DEAFtalk
2. Install Node dependencies
bash
npm install
If server and client are separate folders, install in both accordingly.

3. Setup environment variables
Create .env file(s) as required (example):

env
PORT=5000
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_secret
4. Start backend server
bash
npm run server
(or your project-specific start command)

5. Start frontend
bash
npm run client
(or open the frontend entry file if using static setup)

6. Start ML service (if separate)
bash
cd ml_service
# create venv (first time)
python -m venv .venv
# activate venv (Windows)
.venv\Scripts\activate
pip install -r requirements.txt
python app.py
🧪 Usage Flow
Login/Register
Open chat with a contact
Click Video Call button (main action)
In call screen:
Toggle mic/video
Start hand detection
View ML prediction panel
Use speech/sign translation helpers
✅ Recent Improvements
Fixed video toggle sync issues with hand-detection camera flow
Improved detection panel behavior and camera state handling
Better stream handling between WebRTC and ML modules
Added/organized sign assets (alphabets, numbers, words)
Cleaned repository tracking via proper .gitignore setup
🔒 .gitignore Notes
This project ignores generated/dependency folders like:

node_modules/
.venv/, ml_service/.venv/
logs, cache, temp files, environment secrets
🤝 Contribution
Contributions are welcome.

Fork repo
Create feature branch
Commit changes
Push branch
Open Pull Request
📌 Future Scope
Group video calls
More robust sign vocabulary/model accuracy
Multi-language speech/sign mapping
Better low-bandwidth optimization
Call recording/transcript accessibility options
👨‍💻 Author
Developed by Sumit Chauhan
GitHub: @sumitchauhan00

If this project helped you, consider giving it a ⭐ on GitHub.
