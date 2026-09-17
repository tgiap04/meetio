# ĐẶC TẢ DỰ ÁN (PROJECT SPECIFICATION)
**Tên dự án:** GraphMeet (Trợ lý phòng họp AI thông minh)
**Nền tảng:** Mobile App (Android & iOS)
**Mô hình AI:** GraphRAG, LLM (Gemini/OpenAI)

---

## 1. MỤC TIÊU DỰ ÁN
Xây dựng một ứng dụng di động đa nền tảng hỗ trợ ghi âm, chuyển đổi giọng nói thành văn bản (STT) theo thời gian thực. Sau khi cuộc họp kết thúc, hệ thống sử dụng kiến trúc GraphRAG để bóc tách thông tin thành Đồ thị tri thức, cho phép AI tóm tắt nội dung chính xác và hỗ trợ người dùng hỏi đáp (Q&A) về các chi tiết trong cuộc họp.

## 2. TECH STACK (CÔNG NGHỆ SỬ DỤNG)
*   **Frontend (Mobile):** Expo / React Native.
    *   *STT & Audio:* `@react-native-voice/voice` (để gọi Native SpeechRecognizer của Android/iOS) hoặc sử dụng tính năng Audio recording của `expo-av` kết hợp Expo Modules.
*   **Backend:** Node.js (NestJS hoặc Express).
    *   *Real-time:* `Socket.io` (Xử lý luồng text và dịch thuật).
*   **Database:** PostgreSQL.
    *   *Vector Extension:* `pgvector` (Lưu trữ embedding).
    *   *ORM:* Prisma hoặc TypeORM.
*   **AI Services:** 
    *   *LLM & Embedding:* Google Gemini API (tiết kiệm chi phí, xử lý text dài tốt).

---

## 3. DANH SÁCH TÍNH NĂNG (FEATURES)

### 3.1. Tính năng Real-time (Trong cuộc họp)
*   **F1. Ghi âm & STT Real-time:** Mở mic ghi âm, màn hình tự động cuộn và hiển thị văn bản (Text) ngay khi người dùng đang nói (Sử dụng engine nhận diện của thiết bị).
*   **F2. Dịch thuật song song (Tùy chọn):** Khi có đoạn text mới, app tự động hiển thị dòng dịch sang ngôn ngữ đích ngay bên dưới.
*   **F3. Lưu trữ ngữ cảnh:** Gửi các đoạn text đã nhận diện lên Backend liên tục để giữ an toàn dữ liệu, tránh mất mát nếu app bị đóng đột ngột.

### 3.2. Tính năng Quản lý (CRUD)
*   **F4. Danh sách cuộc họp:** Xem danh sách, tìm kiếm các cuộc họp cũ theo tên, ngày tháng.
*   **F5. Chi tiết cuộc họp:** Xem lại toàn bộ nguyên văn cuộc họp (Full Transcript). Người dùng có quyền sửa thủ công (Edit Text) nếu STT nhận diện sai vài từ khóa chuyên ngành.
*   **F6. Xóa cuộc họp:** Xóa thông tin (đồng thời xóa dữ liệu vector và graph tương ứng trên DB).

### 3.3. Tính năng AI & GraphRAG (Sau cuộc họp)
*   **F7. Xây dựng Đồ thị (Indexing):** Ngay khi kết thúc họp, hệ thống tự động chạy background task: Chia nhỏ Text -> Gọi AI bóc tách Thực thể (Node) & Quan hệ (Edge) -> Lưu vào Database & Vector.
*   **F8. Tóm tắt thông minh (Summarization):** Trả về bản tóm tắt ý chính (Executive Summary) và Danh sách công việc cần làm (Action Items).
*   **F9. Hỏi đáp (Q&A):** Cửa sổ chat AI trong mỗi cuộc họp. Người dùng đặt câu hỏi bằng ngôn ngữ tự nhiên, hệ thống dùng GraphRAG tìm kiếm chéo thông tin và trả lời.

---

## 4. KIẾN TRÚC LUỒNG DỮ LIỆU (DATA FLOW)

### Luồng 1: Realtime STT & Dịch (Client-heavy)
1. User nhấn "Start Meeting" trên Expo App.
2. Expo gọi API Native STT bắt đầu nhận diện giọng nói.
3. Cứ mỗi khi Native STT trả về một đoạn text hoàn chỉnh (ví dụ sau một câu), Expo App gửi event `new_transcript_chunk` qua WebSocket lên Backend.
4. Backend lưu tạm đoạn text này vào Redis/Memory, đồng thời (nếu có yêu cầu) dịch đoạn text đó và gửi event `translated_chunk` ngược lại Expo.
5. Màn hình Expo cập nhật UI. Mọi thao tác media hoàn toàn nằm ở Client, Backend chỉ nhận chữ (Thuần Text).

### Luồng 2: Indexing & GraphRAG (Backend-heavy)
1. User nhấn "End Meeting". Expo gửi API REST `POST /meetings` chứa toàn bộ Full Transcript (như một mảng các câu thoại).
2. Backend lưu vào bảng `meetings`.
3. Backend kích hoạt AI Pipeline:
    *   **Bước 3.1 (Chunking):** Cắt Full Transcript thành các `meeting_chunks`. Embed các chunk này thành Vector.
    *   **Bước 3.2 (Graph Extract):** Đưa các chunk vào LLM yêu cầu trả về JSON chứa mảng `Nodes` và `Edges`.
    *   **Bước 3.3 (Graph Vector):** Embed tên và mô tả của các `Nodes`.
    *   **Bước 3.4 (Save DB):** Lưu toàn bộ vào PostgreSQL (bảng nodes, edges, map với chunk_id).
4. Backend cập nhật trạng thái "Processing Done", bắn notification cho Expo.

---

## 5. CẤU TRÚC DATABASE (POSTGRESQL)

Dưới đây là 4 bảng cốt lõi phục vụ hệ thống GraphRAG:

*   **Bảng `meetings`** (Thông tin chung)
    *   `id` (UUID) - PK
    *   `title` (String)
    *   `full_transcript` (Text)
    *   `summary` (Text)
    *   `action_items` (JSONB)
    *   `created_at` (Timestamp)

*   **Bảng `meeting_chunks`** (Nguyên liệu thô cho LLM)
    *   `id` (UUID) - PK
    *   `meeting_id` (UUID) - FK
    *   `content` (Text)
    *   `embedding` (Vector - pgvector)

*   **Bảng `graph_nodes`** (Thực thể để tìm kiếm điểm neo)
    *   `id` (UUID) - PK
    *   `meeting_id` (UUID) - FK
    *   `name` (String) - VD: "Anh Bình", "Dự án ABC"
    *   `type` (String) - VD: "Person", "Project"
    *   `description` (Text)
    *   `embedding` (Vector - pgvector)
    *   `source_chunk_ids` (Array of UUIDs) - Trỏ về các chunks chứa thực thể này.

*   **Bảng `graph_edges`** (Mối quan hệ)
    *   `id` (UUID) - PK
    *   `meeting_id` (UUID) - FK
    *   `source_node_id` (UUID) - FK
    *   `target_node_id` (UUID) - FK
    *   `relationship` (String) - VD: "yêu cầu sử dụng", "phụ trách"
    *   `source_chunk_ids` (Array of UUIDs)

---

## 6. ĐẶC TẢ GIAO TIẾP (API & WEBSOCKET)

### 6.1. WebSocket Events (Namespace: `/meeting-room`)
*   `Client -> Server`: `join_room` (Gửi meeting_id để mở luồng).
*   `Client -> Server`: `send_transcript` (Payload: `{ text: "...", timestamp: "..." }`).
*   `Server -> Client`: `receive_translation` (Payload: `{ original_text: "...", translated_text: "..." }`).

### 6.2. RESTful APIs
*   **POST** `/api/meetings`: Lưu toàn bộ transcript sau khi họp xong và trigger GraphRAG background job.
*   **GET** `/api/meetings`: Lấy danh sách lịch sử.
*   **GET** `/api/meetings/:id`: Lấy chi tiết cuộc họp, bao gồm text, summary.
*   **PUT** `/api/meetings/:id`: Sửa tiêu đề hoặc chỉnh sửa transcript (sẽ trigger cập nhật lại Vector/Graph nếu cần).
*   **DELETE** `/api/meetings/:id`: Xóa cuộc họp.
*   **POST** `/api/meetings/:id/qa`: Endpoint Hỏi đáp AI. (Payload: `{ question: "Sếp giao việc gì?" }` -> Response: `{ answer: "..." }`).
