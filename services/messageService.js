import * as messageModel from '../models/messageModel.js';
import * as userModel from '../models/userModel.js';
import { ApiError } from '../middleware/errorHandler.js';
import { notifyUser, notifyAdmins } from './notificationService.js';

function toPublicMessage(row) {
  return {
    id: row.id,
    senderRole: row.sender_role,
    body: row.body,
    isRead: Boolean(row.is_read),
    createdAt: row.created_at,
  };
}

function preview(text, max = 140) {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function cleanBody(body) {
  const text = String(body ?? '').trim();
  if (!text) throw new ApiError(422, 'Write a message first.');
  if (text.length > 1000) throw new ApiError(422, 'Messages can be up to 1000 characters.');
  return text;
}

async function requireCustomer(customerId) {
  const customer = await userModel.findById(customerId);
  if (!customer || customer.role !== 'customer') throw new ApiError(404, 'Customer not found.');
  return customer;
}

// --- Customer side --------------------------------------------------------

export async function getMyThread(customer) {
  await messageModel.markThreadRead(customer.id, 'admin');
  const rows = await messageModel.findThread(customer.id);
  return { messages: rows.map(toPublicMessage) };
}

export async function sendFromCustomer(customer, body) {
  const text = cleanBody(body);
  const row = await messageModel.create({
    customerId: customer.id,
    senderRole: 'customer',
    senderId: customer.id,
    body: text,
  });
  await notifyAdmins({
    type: 'customer_message',
    title: `Message from ${customer.name}`.slice(0, 150),
    message: preview(text, 300),
    link: `/admin/messages?customer=${customer.id}`,
  });
  return toPublicMessage(row);
}

// --- Admin side -----------------------------------------------------------

export async function listConversations({ search } = {}) {
  const rows = await messageModel.listConversations({ search: String(search || '').trim() });
  return {
    conversations: rows.map((r) => ({
      customerId: r.customer_id,
      name: r.name,
      email: r.email,
      lastMessage: preview(r.last_body, 90),
      lastSender: r.last_sender,
      lastAt: r.last_at,
      unread: r.unread,
    })),
  };
}

export async function searchCustomers({ search } = {}) {
  return { customers: await messageModel.searchCustomers(String(search || '').trim()) };
}

export async function getAdminUnreadCount() {
  return messageModel.countUnreadForAdmin();
}

export async function getThreadForAdmin(customerId) {
  const customer = await requireCustomer(customerId);
  await messageModel.markThreadRead(customer.id, 'customer');
  const rows = await messageModel.findThread(customer.id);
  return {
    customer: { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone },
    messages: rows.map(toPublicMessage),
  };
}

export async function sendFromAdmin(admin, customerId, body) {
  const customer = await requireCustomer(customerId);
  const text = cleanBody(body);
  const row = await messageModel.create({
    customerId: customer.id,
    senderRole: 'admin',
    senderId: admin.id,
    body: text,
  });
  // The customer's bell lights up and links straight to the conversation.
  await notifyUser(customer.id, {
    type: 'admin_message',
    title: 'New message from ShopEase',
    message: preview(text, 300),
    link: '/messages',
  });
  return toPublicMessage(row);
}
