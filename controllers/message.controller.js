import { sendSuccess } from '../utils/apiResponse.js';
import * as messageService from '../services/messageService.js';

const wrap = (fn) => async (req, res, next) => {
  try {
    return await fn(req, res);
  } catch (err) {
    return next(err);
  }
};

// Customer
export const myThread = wrap(async (req, res) =>
  sendSuccess(res, { message: 'Messages fetched.', data: await messageService.getMyThread(req.user) })
);
export const sendMine = wrap(async (req, res) =>
  sendSuccess(res, {
    statusCode: 201,
    message: 'Message sent.',
    data: { message: await messageService.sendFromCustomer(req.user, req.body.body) },
  })
);

// Admin
export const conversations = wrap(async (req, res) =>
  sendSuccess(res, {
    message: 'Conversations fetched.',
    data: await messageService.listConversations({ search: req.query.search }),
  })
);
export const customers = wrap(async (req, res) =>
  sendSuccess(res, {
    message: 'Customers fetched.',
    data: await messageService.searchCustomers({ search: req.query.search }),
  })
);
export const adminUnreadCount = wrap(async (req, res) =>
  sendSuccess(res, {
    message: 'Unread count fetched.',
    data: { unreadCount: await messageService.getAdminUnreadCount() },
  })
);
export const adminThread = wrap(async (req, res) =>
  sendSuccess(res, {
    message: 'Conversation fetched.',
    data: await messageService.getThreadForAdmin(Number(req.params.customerId)),
  })
);
export const sendFromAdmin = wrap(async (req, res) =>
  sendSuccess(res, {
    statusCode: 201,
    message: 'Message sent.',
    data: { message: await messageService.sendFromAdmin(req.user, Number(req.params.customerId), req.body.body) },
  })
);
