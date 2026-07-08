export type LevelId = "L1" | "L2";

export interface User {
  id: string;
  username: string;
  createdAt: string;
}

export interface PublicUser {
  id: string;
  username: string;
}

export type FriendRequestStatus = "pending" | "accepted" | "rejected";

export interface FriendRequest {
  id: string;
  fromUserId: string;
  toUserId: string;
  status: FriendRequestStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Friendship {
  userIdA: string;
  userIdB: string;
  createdAt: string;
}
