import { sendSuccess } from '../utils/apiResponse.js';
import * as addressService from '../services/addressService.js';

export async function list(req, res, next) {
  try {
    const addresses = await addressService.listAddresses(req.user.id);
    return sendSuccess(res, { message: 'Addresses fetched.', data: { addresses } });
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const address = await addressService.createAddress(req.user.id, req.body);
    return sendSuccess(res, { statusCode: 201, message: 'Address saved.', data: { address } });
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const address = await addressService.updateAddress(Number(req.params.id), req.user.id, req.body);
    return sendSuccess(res, { message: 'Address updated.', data: { address } });
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    await addressService.deleteAddress(Number(req.params.id), req.user.id);
    return sendSuccess(res, { message: 'Address deleted.' });
  } catch (err) {
    next(err);
  }
}

export async function setDefault(req, res, next) {
  try {
    const address = await addressService.setDefaultAddress(Number(req.params.id), req.user.id);
    return sendSuccess(res, { message: 'Default address updated.', data: { address } });
  } catch (err) {
    next(err);
  }
}
