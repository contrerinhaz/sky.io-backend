# SkyCare Backend API

Sky.io Backend (package: skycare-backend) is a comprehensive safety management platform designed for companies that operate outdoors. Its goal is to optimize operational decision-making through AI-based safety recommendations.

The system combines real-time weather data with the company's location and work schedule analysis using natural language processing. With this integration, it generates personalized safety advice that allows businesses to anticipate environmental risks and plan their activities more efficiently.

Overall, Sky.io Backend is a robust backend service that combines climate information, intelligent analysis, and advanced technologies to support the continuity and safety of business operations exposed to external conditions.

## 🌟 Features

- **Weather Intelligence**: Real-time and forecast weather data with intelligent caching
- **AI-Powered Recommendations**: Context-aware safety recommendations using OpenAI GPT-4
- **Multi-tenant Architecture**: User-scoped data access with administrative controls
- **Role-Based Access Control**: Admin and customer roles with appropriate permissions
- **Geolocation Support**: Company management with latitude/longitude coordinates
- **Robust Authentication**: JWT-based authentication system
- **Database Migrations**: Automated schema management system
- **API Fallback**: Redundant weather API integration for high availability

## System Architecture

### High-Level Component Overview
<img width="1429" height="536" alt="image" src="https://github.com/user-attachments/assets/4bd9920f-d170-49ac-855a-1bb8b1323e5b" />



# Technology Stack

| Category        | Technology                            | Purpose                                        | Configuration                   |
|-----------------|---------------------------------------|------------------------------------------------|---------------------------------|
| Web Framework   | Express.js 4.19.2                     | HTTP server and routing                        | Port 3001 default                |
| Database        | MySQL 8.0+ with mysql2 driver         | Data persistence                               | Connection pooling enabled       |
| Authentication  | JWT + bcryptjs                        | User authentication and password hashing       | 7-day token expiration           |
| AI Integration  | OpenAI API 4.58.1                     | Schedule parsing and recommendation generation | GPT-4o-mini model                |
| Weather Data    | Tomorrow.io + Open-Meteo              | Real-time and forecast weather data            | Fallback strategy implemented    |
| Validation      | Zod 3.23.8                            | Input validation and type safety               | Schema-based validation          |
| Date/Time       | Luxon 3.7.1 + tz-lookup               | Timezone-aware date handling                   | Location-based timezone detection |
| HTTP Client     | Axios 1.7.2                           | External API communication                     | Used for weather and AI services |


### Project Structure

```
├── migrations/              # Database migration files
│   ├── 001_roles.sql        # User roles setup
│   ├── 002_users.sql        # User management tables
│   ├── 003_companies.sql    # Company data with geolocation
│   └── 004_history.sql      # AI interaction history
├── src/
│   ├── lib/                 # Core libraries
│   │   ├── db.js            # Database connection pool
│   │   ├── openai.js        # OpenAI integration
│   │   ├── recommendations.js # Safety rule engine
│   │   └── weather.js       # Weather API integration
│   ├── routes/              # API route handlers
│   │   ├── auth.js          # Authentication endpoints
│   │   └── companies.js     # Company management
│   ├── migrate.js           # Database migration runner
│   └── server.js            # Main server application
└── package.json             # Dependencies and scripts
```

# Getting Started

This guide provides step-by-step instructions for setting up and running the **Sky.io Backend** system locally. It covers installation, configuration, database setup, and initial application startup.

For detailed information about individual system components, see **Installation and Dependencies** and **Configuration**.  
For understanding the overall system architecture, see **System Architecture**.

---

## Prerequisites

Before setting up the Sky.io Backend, ensure you have the following installed:

| Requirement | Minimum Version | Purpose                          |
|-------------|-----------------|----------------------------------|
| Node.js     | 18.0+           | JavaScript runtime environment   |
| npm         | 9.0+            | Package manager (comes with Node.js) |
| MySQL       | 8.0+            | Primary database system          |

You will also need API keys for the following external services:

- **Tomorrow.io API** (primary weather provider)  
- **OpenAI API** (for AI-powered recommendations)  


## Installation

## 1. Clone and Install Dependencies

```bash
# Clone the repository
cd Sky.io_Backend

# Install all project dependencies
npm install

## 2. Install dependencies

# Install dependencies
npm install

# Set up environment variables (see Configuration section)
cp .env.example .env

# Run database migrations
npm run migrate

# Start development server
npm run dev
```

## 3. Environment Configuration

Create a `.env` file in the root directory:

```env
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
```

---

## 4. Database Setup

Run the migration script to set up your database:

```bash
npm run migrate
```

---

## 5. Start the server

```bash
# Development
npm run dev

# Production
npm start
```

---

## 📚 API Documentation

### Authentication Endpoints

#### Register User
```http
POST /api/auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "securepassword",
  "role": "customer"
}
```

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "securepassword"
}
```

---

### Company Management

#### List Companies
```http
GET /api/companies
Authorization: Bearer <jwt_token>
```

#### Create Company
```http
POST /api/companies
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "name": "Outdoor Adventures Inc",
  "latitude": 40.7128,
  "longitude": -74.0060,
  "description": "Adventure tourism company"
}
```

#### Get Weather Data
```http
GET /api/companies/:id/weather
Authorization: Bearer <jwt_token>
```

#### AI Safety Recommendations
```http
POST /api/companies/:id/advanced-query
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "query": "What safety precautions should we take for tomorrow's outdoor activities?"
}
```

---

### Admin Endpoints

#### User Management
```http
GET /api/admin/users          # List all users
POST /api/admin/users         # Create user
PUT /api/admin/users/:id      # Update user
DELETE /api/admin/users/:id   # Delete user
```

#### Company Administration
```http
GET /api/admin/companies        # List all companies
POST /api/admin/companies       # Create company
PUT /api/admin/companies/:id    # Update company
DELETE /api/admin/companies/:id # Delete company
```
## 🔧 Configuration DB

### Database Schema

The application uses a structured migration system with the following tables:

- **roles**: User role definitions (admin, customer)
- **users**: User accounts with role associations
- **companies**: Business entities with geolocation data
- **historial**: AI interaction logs and recommendations
# Connection Pool Configuration

The database connection pool in `getPool()` implements a singleton pattern with MySQL-specific optimizations.  
The pool maintains up to **10 concurrent connections** and supports both **named placeholders** and **multiple statements** for complex operations.

| Configuration Property | Value                                | Purpose                                |
|-------------------------|--------------------------------------|----------------------------------------|
| host                    | process.env.DB_HOST                  | Database server hostname               |
| port                    | Number(process.env.DB_PORT \|\| 3306) | Database port with default fallback    |
| user                    | process.env.DB_USER                  | Database username                      |
| password                | process.env.DB_PASSWORD              | Database password                      |
| database                | process.env.DB_NAME                  | Target database name                   |
| connectionLimit         | 10                                   | Maximum concurrent connections         |
| namedPlaceholders       | true                                 | Enable :param syntax for queries       |
| multipleStatements      | true                                 | Allow multiple SQL statements per query |

The `query()` function provides a simplified interface that automatically handles connection pooling and result extraction through array destructuring of the MySQL2 response format.

**Sources:**  
`src/lib/db.js` (lines 5–24)

---

# Database Schema Structure

The database implements a simple **two-table schema** optimized for the safety management platform's core functionality.  
Both tables use **InnoDB engine** with **UTF-8 character set** for full Unicode support.

| Table     | Primary Purpose                   | Key Features                                              |
|-----------|-----------------------------------|-----------------------------------------------------------|
| users     | User authentication and profiles  | Email uniqueness constraint, password hashing support     |
| companies | Company location and activities   | Decimal lat/lon precision, activity categorization        |

- The **companies** table stores geolocation data with `DECIMAL(10,7)` precision for latitude and longitude coordinates, enabling accurate weather API integration.  
- The **users** table implements email-based authentication with unique constraints and supports password hashing through the `password_hash` field.  

Both tables include **auto-incrementing primary keys** and **TIMESTAMP fields** with automatic creation timestamps for audit trails.

### API Layer Integration

The API Layer serves as the primary interface between client applications and the Sky.io Backend system, providing RESTful endpoints for user authentication, company management, weather data retrieval, and AI-powered safety recommendations. This layer implements the Express.js server framework with comprehensive middleware for request processing, validation, and error handling.

For detailed information about server configuration and middleware setup, see 3.2.1. For authentication implementation details, see 3.2.2. For company-specific API functionality, see 3.2.3.

RESTful API Architecture
The API layer follows REST architectural principles with a clear separation between authentication and business logic endpoints. The system exposes two main route groups mounted on distinct URL paths.

The system implements a robust weather data fetching strategy:

1. **Primary**: Tomorrow.io API for comprehensive weather data
2. **Fallback**: Open-Meteo API for redundancy
3. **Caching**: Intelligent caching to minimize API calls
4. **Rate Limiting**: Built-in request throttling

### AI Recommendations

# Safety Recommendations Engine

## Relevant source files

### Purpose and Scope
The Safety Recommendations Engine provides rule-based safety recommendations for outdoor operations based on environmental conditions.  
This system applies predefined thresholds for **temperature, UV radiation, wind speed, and precipitation** to generate immediate safety alerts and operational guidance.  
The engine complements the AI-powered recommendations (see *AI Services*) by providing fast, deterministic safety rules that don't require external API calls.

For weather data acquisition and processing, see *Weather Integration Service*.  
For AI-generated personalized recommendations, see *AI Services*.

---

## System Architecture
The Safety Recommendations Engine operates as a pure function that processes environmental data and returns safety recommendations based on predefined thresholds.

**Sources:**  
`src/lib/recommendations.js` (lines 1–44)

---

## Rule Engine Logic
The `quickRules` function implements a threshold-based decision system that evaluates four environmental parameters and generates corresponding safety recommendations.

### Function Signature and Data Processing
- Uses the **nullish coalescing operator (??)** to provide default values of 0 for missing parameters.  
- Ensures robust operation even with incomplete data.  

**Sources:**  
`src/lib/recommendations.js` (lines 1–6)

---

## Environmental Thresholds

### Temperature Thresholds
| Temperature Range | Condition     | Safety Recommendation |
|-------------------|--------------|------------------------|
| ≥ 35°C            | Extreme Heat | Reschedule physical shifts to dawn/evening; prioritize indoor tasks; monitor heat stroke signs |
| ≥ 30°C            | Moderate Heat| Increase breaks; enable nearby hydration points; rotate outdoor personnel |
| ≤ 5°C             | Severe Cold  | Reduce outdoor exposure; implement active breaks; ensure certified thermal clothing |

### UV Radiation Thresholds
| UV Index | Condition | Safety Recommendation |
|----------|-----------|------------------------|
| ≥ 6      | High UV   | Restrict prolonged exposed tasks (welding, roofing, navigation); provide adequate PPE; work in shade |

### Wind Speed Thresholds
The system converts wind speed from m/s to km/h using `wind * 3.6`.

| Wind Speed (km/h) | Condition     | Safety Recommendation |
|-------------------|--------------|------------------------|
| ≥ 60 km/h         | Very Strong  | Suspend ALL crane operations, hoisting, or height work; withdraw personnel; secure machinery |
| ≥ 45 km/h         | Strong       | Prohibit hoisting; use lifelines; secure temporary structures; check moorings |
| ≥ 30 km/h         | Moderate     | Enhanced supervision for manual tools/scaffolding; check tarps and signage |

### Precipitation Thresholds
| Precipitation (mm) | Condition    | Safety Recommendation |
|--------------------|-------------|------------------------|
| ≥ 30 mm            | Intense Rain| Postpone excavation, electrical, or welding work; provide lighting and shelter areas |
| > 0 mm             | Light Rain  | Extra caution for slippery surfaces; mandatory non-slip footwear; check drainage systems |

**Sources:**  
`src/lib/recommendations.js` (lines 8–36)

---

## Integration with System Components
The Safety Recommendations Engine integrates with other system components through the **company management API endpoints**.

**Sources:**  
`src/lib/recommendations.js` (lines 1–44)

---

## Default Safety Condition
When all environmental parameters fall within safe ranges, the system provides a default recommendation encouraging standard safety protocols:

✅ **Condiciones normales**: aplicar rutina estándar de seguridad, monitoreo continuo y chequeo de clima cada 3 horas.

This ensures that users always receive guidance, even under normal conditions, maintaining awareness of the need for continuous monitoring.

**Sources:**  
`src/lib/recommendations.js` (lines 39–41)

---

## Error Handling and Data Validation
The function implements defensive programming practices by:
- Using **Number()** conversion with nullish coalescing for type safety  
- Providing default values for missing parameters  
- Applying **unit conversions** (wind speed from m/s to km/h) within the function  
- Always returning at least one recommendation (either condition-specific or default)  

The robust parameter handling ensures the function operates reliably regardless of input data quality from weather services.
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
