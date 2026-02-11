

# Policy & Compliance Oracle

A full-featured, public-facing AI-powered document Q&A platform that lets users upload policy PDFs, ask natural language questions, and receive cited answers with exact page/section references.

---

## 1. Authentication & User Roles
- **Public sign-up/login** with email and Google sign-in
- **Two roles**: Admin (manages documents, views analytics) and User (queries documents)
- Admin dashboard to manage users and monitor usage

## 2. Document Management
- **Upload interface** for PDFs with drag-and-drop support
- Document library showing all uploaded policies with title, upload date, page count, and status
- Documents are processed after upload: text is extracted, chunked, and indexed for AI search
- Admins can organize documents into categories (e.g., "HR Policies", "Procurement Rules", "Legal Frameworks")
- Delete and re-upload capabilities

## 3. AI Chat Interface
- Clean chat interface where users ask questions in natural language
- AI answers are generated **only from uploaded documents** (no hallucinated external knowledge)
- **Every answer includes citations**: document name, page number, and relevant paragraph/section
- Users can click citations to view the source passage for verification
- Streaming responses so answers appear in real-time

## 4. Conversation History
- All conversations are saved and accessible from a sidebar
- Users can revisit past Q&A sessions
- Ability to rename, delete, or export conversations

## 5. Admin Dashboard & Analytics
- See which documents are most queried
- View total questions asked, active users, and popular topics
- Manage document library (upload, categorize, archive, delete)
- User management panel

## 6. Design & Experience
- Clean, professional UI suitable for government/enterprise use
- Responsive design for desktop and tablet
- Light/dark mode support
- Accessible design following WCAG guidelines

---

## Technical Approach
- **Lovable Cloud** for authentication, database, file storage, and edge functions
- **Lovable AI** for generating answers from document context
- PDF text extraction and chunking handled via edge functions
- Vector-based document search for finding relevant passages to feed to the AI

