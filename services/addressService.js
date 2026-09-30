import { ApiError } from '../middleware/errorHandler.js';
import * as addressModel from '../models/addressModel.js';

function toPublicAddress(row) {
  return {
    id: row.id,
    fullName: row.full_name,
    phone: row.phone,
    line1: row.line1,
    line2: row.line2,
    city: row.city,
    state: row.state,
    postalCode: row.postal_code,
    country: row.country,
    isDefault: Boolean(row.is_default),
  };
}

async function assertOwnedByUser(id, userId) {
  const address = await addressModel.findById(id);
  if (!address || address.user_id !== userId) {
    throw new ApiError(404, 'Address not found.');
  }
  return address;
}

export async function listAddresses(userId) {
  const rows = await addressModel.findAllByUser(userId);
  return rows.map(toPublicAddress);
}

export async function getAddress(id, userId) {
  const address = await assertOwnedByUser(id, userId);
  return toPublicAddress(address);
}

export async function createAddress(userId, payload) {
  // The very first address a user saves becomes their default automatically;
  // afterwards it's opt-in via `isDefault` or the dedicated "set default" action.
  const isFirstAddress = (await addressModel.countByUser(userId)) === 0;
  const makeDefault = isFirstAddress || Boolean(payload.isDefault);

  if (makeDefault) await addressModel.clearDefault(userId);

  const address = await addressModel.create({ userId, ...payload, isDefault: makeDefault });
  return toPublicAddress(address);
}

export async function updateAddress(id, userId, payload) {
  await assertOwnedByUser(id, userId);
  const address = await addressModel.update(id, payload);
  return toPublicAddress(address);
}

export async function deleteAddress(id, userId) {
  const address = await assertOwnedByUser(id, userId);
  await addressModel.remove(id);

  // If the default address was just deleted, promote the next most recent
  // one so checkout always has a sensible pre-selection when any exist.
  if (address.is_default) {
    const remaining = await addressModel.findAllByUser(userId);
    if (remaining.length) await addressModel.setDefault(remaining[0].id);
  }
}

export async function setDefaultAddress(id, userId) {
  await assertOwnedByUser(id, userId);
  await addressModel.clearDefault(userId);
  await addressModel.setDefault(id);
  return getAddress(id, userId);
}
