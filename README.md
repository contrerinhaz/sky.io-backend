# SkyCare Backend API

A comprehensive weather-based business operations platform that provides AI-powered safety recommendations for outdoor businesses. This backend service integrates real-time weather data with intelligent analysis to help companies make informed decisions about their operations.

## 🌟 Features

- **Weather Intelligence**: Real-time and forecast weather data with intelligent caching
- **AI-Powered Recommendations**: Context-aware safety recommendations using OpenAI GPT-4
- **Multi-tenant Architecture**: User-scoped data access with administrative controls
- **Role-Based Access Control**: Admin and customer roles with appropriate permissions
- **Geolocation Support**: Company management with latitude/longitude coordinates
- **Robust Authentication**: JWT-based authentication system
- **Database Migrations**: Automated schema management system
- **API Fallback**: Redundant weather API integration for high availability

## 🏗️ Architecture

### Technology Stack

- **Runtime**: Node.js with Express.js
- **Database**: MySQL with connection pooling
- **Authentication**: JWT (JSON Web Tokens)
- **AI Integration**: OpenAI GPT-4o-mini
- **Weather APIs**: Tomorrow.io (primary) with Open-Meteo fallback
- **Frontend**: Next.js 14.2.25 with React 19
- **UI Components**: Radix UI with Tailwind CSS

### Project Structure

\`\`\`
├── migrations/           # Database migration files
│   ├── 001_roles.sql    # User roles setup
│   ├── 002_users.sql    # User management tables
│   ├── 003_companies.sql # Company data with geolocation
│   └── 004_history.sql  # AI interaction history
├── src/
│   ├── lib/             # Core libraries
│   │   ├── db.js        # Database connection pool
│   │   ├── openai.js    # OpenAI integration
│   │   ├── recommendations.js # Safety rule engine
│   │   └── weather.js   # Weather API integration
│   ├── routes/          # API route handlers
│   │   ├── auth.js      # Authentication endpoints
│   │   └── companies.js # Company management
│   ├── migrate.js       # Database migration runner
│   └── server.js        # Main server application
└── package.json         # Dependencies and scripts
\`\`\`

## 🚀 Getting Started

### Prerequisites

- Node.js (v18 or higher)
- MySQL database
- OpenAI API key
- Tomorrow.io API key

### Installation

1. **Clone the repository**
   \`\`\`bash
   git clone <repository-url>
   cd skyiobackenddevelop
   \`\`\`

2. **Install dependencies**
   \`\`\`bash
   npm install
   \`\`\`

3. **Environment Configuration**
   
   Create a `.env` file in the root directory:
   \`\`\`env
   # Database Configuration
   DB_HOST=localhost
   DB_USER=your_db_user
   DB_PASSWORD=your_db_password
   DB_NAME=skycare_db
   
   # Authentication
   JWT_SECRET=your_jwt_secret_key
   
   # API Keys
   OPENAI_API_KEY=your_openai_api_key
   TOMORROW_API_KEY=your_tomorrow_io_api_key
   
   # Server Configuration
   PORT=3001
   CORS_ORIGIN=http://localhost:3000
   \`\`\`

4. **Database Setup**
   
   Run the migration script to set up your database:
   \`\`\`bash
   npm run migrate
   \`\`\`

5. **Start the server**
   \`\`\`bash
   # Development
   npm run dev
   
   # Production
   npm start
   \`\`\`

## 📚 API Documentation

### Authentication Endpoints

#### Register User
\`\`\`http
POST /api/auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "securepassword",
  "role": "customer"
}
\`\`\`

#### Login
\`\`\`http
POST /api/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "securepassword"
}
\`\`\`

### Company Management

#### List Companies
\`\`\`http
GET /api/companies
Authorization: Bearer <jwt_token>
\`\`\`

#### Create Company
\`\`\`http
POST /api/companies
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "name": "Outdoor Adventures Inc",
  "latitude": 40.7128,
  "longitude": -74.0060,
  "description": "Adventure tourism company"
}
\`\`\`

#### Get Weather Data
\`\`\`http
GET /api/companies/:id/weather
Authorization: Bearer <jwt_token>
\`\`\`

#### AI Safety Recommendations
\`\`\`http
POST /api/companies/:id/advanced-query
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "query": "What safety precautions should we take for tomorrow's outdoor activities?"
}
\`\`\`

### Admin Endpoints

#### User Management
\`\`\`http
GET /api/admin/users          # List all users
POST /api/admin/users         # Create user
PUT /api/admin/users/:id      # Update user
DELETE /api/admin/users/:id   # Delete user
\`\`\`

#### Company Administration
\`\`\`http
GET /api/admin/companies      # List all companies
POST /api/admin/companies     # Create company
PUT /api/admin/companies/:id  # Update company
DELETE /api/admin/companies/:id # Delete company
\`\`\`

## 🔧 Configuration

### Database Schema

The application uses a structured migration system with the following tables:

- **roles**: User role definitions (admin, customer)
- **users**: User accounts with role associations
- **companies**: Business entities with geolocation data
- **historial**: AI interaction logs and recommendations

### Weather API Integration

The system implements a robust weather data fetching strategy:

1. **Primary**: Tomorrow.io API for comprehensive weather data
2. **Fallback**: Open-Meteo API for redundancy
3. **Caching**: Intelligent caching to minimize API calls
4. **Rate Limiting**: Built-in request throttling

### AI Recommendations

The AI system provides context-aware safety recommendations by:

1. Analyzing current and forecast weather conditions
2. Considering company location and business type
3. Applying safety rules and best practices
4. Generating actionable recommendations
5. Logging interactions for continuous improvement

## 🛡️ Security Features

- **JWT Authentication**: Secure token-based authentication
- **Role-Based Access**: Granular permission system
- **Input Validation**: Comprehensive request validation
- **SQL Injection Protection**: Parameterized queries
- **CORS Configuration**: Cross-origin request security
- **Environment Variables**: Secure configuration management

## 🚦 Health Monitoring

The API includes a health check endpoint:

\`\`\`http
GET /api/health
\`\`\`

Returns system status and database connectivity information.

## 📊 Error Handling

The API implements comprehensive error handling with:

- Structured error responses
- HTTP status code compliance
- Detailed error logging
- User-friendly error messages
- Database connection error recovery

## 🔄 Development Workflow

### Available Scripts

\`\`\`bash
npm start          # Start production server
npm run dev        # Start development server with hot reload
npm run migrate    # Run database migrations
npm test           # Run test suite (if configured)
\`\`\`

### Database Migrations

To create a new migration:

1. Create a new SQL file in the `migrations/` directory
2. Follow the naming convention: `XXX_description.sql`
3. Run `npm run migrate` to apply changes

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For support and questions:

- Create an issue in the repository
- Contact the development team
- Check the API documentation for common solutions

## 🔮 Roadmap

- [ ] WebSocket integration for real-time weather updates
- [ ] Advanced analytics and reporting
- [ ] Mobile app API extensions
- [ ] Third-party integrations (Slack, Teams)
- [ ] Enhanced AI recommendation algorithms
- [ ] Multi-language support

---

**Built with ❤️ for safer outdoor business operations**
