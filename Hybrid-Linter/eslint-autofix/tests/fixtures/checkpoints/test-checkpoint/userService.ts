// userService.ts
export function getUserData(userId: string) {
  // Fetch user data from API
  return {
    id: userId,
    name: 'John Doe',
    email: 'john@example.com'
  };
}

export function updateUserInfo(userId: string, userInfo: any) {
  // Previously this was named 'userData', but was renamed to 'userInfo' during refactoring
  console.log(`Updating user ${userId} with ${JSON.stringify(userInfo)}`);
  return true;
}