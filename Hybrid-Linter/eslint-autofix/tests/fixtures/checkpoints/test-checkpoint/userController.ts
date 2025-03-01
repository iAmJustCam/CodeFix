// userController.ts
import { getUserData, updateUserInfo } from './userService';

export function handleUserUpdate(userId: string) {
  // This variable is flagged as unused, but it's actually a refactoring issue
  const userData = getUserData(userId);

  // The problem is here - should be using 'userData' but the function parameter name
  // changed in userService.ts from 'userData' to 'userInfo'
  return updateUserInfo(userId, {
    name: 'Updated Name',
    email: 'updated@example.com'
  });
}