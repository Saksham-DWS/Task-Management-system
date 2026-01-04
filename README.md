# DWS Project Manager

**Digital Web Solutions - Group of Companies**
*Together, We Build What's Next*

A comprehensive project management application with AI-powered insights, built with React (JavaScript) frontend and Python FastAPI backend with MongoDB.

## Features

- **Group → Project → Task Hierarchy**: Organize work in a structured manner
- **Kanban Board**: Drag-and-drop task management with Not Started, In Progress, On Hold, Completed
- **AI Insights**: Goals vs Achievements analysis, project health, and recommendations
- **Permission-Based Access Control**: Role-based access (Admin, Manager, User)
- **Weekly Goals & Achievements**: Track progress at project and task levels
- **Dark Mode**: Full dark theme support with DWS branding
- **Team Workload Management**: Monitor team capacity and distribution
- **Reports & Analytics**: Performance metrics with group and project filters

## Tech Stack

### Frontend
- React 18 with JavaScript
- Tailwind CSS for styling (with Dark Mode)
- Zustand for state management
- React Router for navigation
- @hello-pangea/dnd for drag-and-drop
- Lucide React for icons

### Backend
- Python 3.11+
- FastAPI framework
- MongoDB with Motor (async driver)
- JWT authentication
- OpenAI for AI insights

## Prerequisites

1. **Node.js** (v18 or higher) - [Download](https://nodejs.org/)
2. **Python** (v3.9 or higher) - [Download](https://python.org/)
3. **MongoDB** - Local or MongoDB Atlas

## Quick Start

### Option 1: Using Scripts

**Windows:**
1. Double-click `start-backend.bat` (in one terminal)
2. Double-click `start-frontend.bat` (in another terminal)

**Mac/Linux:**
1. Run backend: `chmod +x start-backend.sh && ./start-backend.sh`
2. Run frontend: `chmod +x start-frontend.sh && ./start-frontend.sh`

### Option 2: Manual Setup

#### Backend Setup

```bash
cd backend

# Create virtual environment (optional but recommended)
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment (edit .env with your credentials)
# MongoDB URL and OpenAI API key are pre-configured

# Seed database with demo data
python seed.py

# Start server
python run.py
```

Backend will run on: http://localhost:8000

#### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

Frontend will run on: http://localhost:5173

## Demo Credentials

| Role    | Email            | Password    |
|---------|------------------|-------------|
| Admin   | admin@dws.com    | admin123    |
| Manager | john@dws.com     | password123 |
| User    | sarah@dws.com    | password123 |
| User    | mike@dws.com     | password123 |

## Environment Variables

### Backend (.env)
```env
MONGODB_URL=mongodb+srv://user:password@cluster.mongodb.net/
DATABASE_NAME=dws_project_manager
SECRET_KEY=your-secret-key-change-in-production
OPENAI_API_KEY=sk-your-openai-api-key
```

### Frontend (.env) - Optional
```env
VITE_API_URL=http://localhost:8000/api
```

## Project Structure

```
dws-project-manager/
├── frontend/
│   ├── src/
│   │   ├── app/           # App configuration and routes
│   │   ├── components/    # Reusable UI components
│   │   ├── hooks/         # Custom React hooks
│   │   ├── pages/         # Page components
│   │   ├── services/      # API service functions
│   │   ├── store/         # Zustand stores
│   │   ├── styles/        # CSS and Tailwind
│   │   └── utils/         # Helper functions and constants
│   ├── package.json
│   └── vite.config.js
├── backend/
│   ├── app/
│   │   ├── models/        # Pydantic models
│   │   ├── routes/        # API routes
│   │   ├── services/      # Business logic (auth, AI)
│   │   ├── config.py      # Configuration
│   │   ├── database.py    # MongoDB connection
│   │   └── main.py        # FastAPI app
│   ├── requirements.txt
│   ├── seed.py            # Database seeding script
│   └── run.py             # Server runner
└── README.md
```

## Access Control System

| Role | Capabilities |
|------|-------------|
| **Admin** | Full access, manage users, delete groups |
| **Manager** | Create/manage groups and projects, assign tasks |
| **User** | View assigned tasks, update status, add achievements |

**Access Hierarchy:**
- Group access → Auto-access to all projects and tasks within
- Project access → Auto-access to all tasks within

## API Endpoints

### Authentication
- `POST /api/auth/login/json` - Login
- `POST /api/auth/register` - Register
- `GET /api/auth/me` - Get current user

### Groups
- `GET /api/groups` - List groups
- `POST /api/groups` - Create group
- `DELETE /api/groups/{id}` - Delete group (Admin only)

### Projects
- `GET /api/projects` - List projects
- `POST /api/projects` - Create project
- `PUT /api/projects/{id}` - Update project

### Tasks
- `GET /api/tasks/my` - My tasks (sorted new to old)
- `GET /api/tasks/project/{id}` - Tasks by project
- `PUT /api/tasks/{id}/status` - Update task status

### AI Insights
- `GET /api/ai/insights` - Get AI insights
- `POST /api/ai/analyze-goals` - Analyze goals vs achievements

### Users (Admin)
- `GET /api/users` - List all users
- `PUT /api/users/{id}/password` - Change password
- `DELETE /api/users/{id}` - Delete user

## Deployment to Google Cloud

### Cloud Run (Recommended)

1. Create Dockerfiles for frontend and backend
2. Build and push images to Google Container Registry
3. Deploy to Cloud Run with environment variables

### Compute Engine

1. Create VM instance (Ubuntu 22.04)
2. Install Node.js, Python, configure MongoDB Atlas
3. Clone repository and configure .env
4. Use PM2 for Node.js, systemd for Python
5. Configure Nginx as reverse proxy

## Troubleshooting

### MongoDB Connection Error
- For MongoDB Atlas: Ensure IP whitelist includes your IP (or 0.0.0.0/0)
- Check connection string format

### bcrypt Error
- If you see bcrypt-related errors, ensure you have `bcrypt==4.0.1` installed
- Run: `pip install bcrypt==4.0.1`

### Port Already in Use
```bash
# Find and kill process
lsof -i :8000  # or :5173
kill -9 <PID>
```

### CORS Issues
Backend allows requests from `http://localhost:5173`. Update `backend/app/main.py` for production.

---

© 2024 Digital Web Solutions - Group of Companies. All rights reserved.
