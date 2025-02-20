import { Server, Socket } from "socket.io";

import { db } from "@/lib/db";
import { Notification } from "@prisma/client";

// active users data structure
export const activeUsers = new Map<string, string>();

export const setupSocket = (io: Server) => {
  io.on("connection", (socket: Socket) => {
    console.log(`🟢 User connected: ${socket.id}`);

    // Register a user
    socket.on("register", async (userId: string) => {
      activeUsers.set(userId, socket.id);
      console.log(`✅ User ${userId} registered with socket ID: ${socket.id}`);

      // Send unseen notifications to user
      const unseenNotifications = await db.notification.findMany({
        where: { userId, seen: false },
      });
      socket.emit("unseenNotifications", unseenNotifications);
    });

    socket.on("sendNotification", async (payload: Notification) => {
      const { userId, type, message, data } = payload;
      const recipientSocketId = activeUsers.get(userId);

      console.log(`📩 Received notification payload for ${userId}:`, payload);

      try {
        const notification = await db.notification.create({
          data: { userId, message, type, data: data || [], seen: false },
        });

        console.log(
          `✅ Notification saved to DB for user ${userId}:`,
          notification
        );

        if (recipientSocketId) {
          io.to(recipientSocketId).emit("notification", notification);
          console.log(`🔔 Sent notification to ${userId}: ${message}`);
        } else {
          console.log(`⚠️ User ${userId} is offline. Notification saved.`);
        }
      } catch (error) {
        console.error(`❌ Error saving notification for ${userId}:`, error);
      }
    });

    // Mark notification as seen
    socket.on("markAsSeen", async (notificationId: string) => {
      await db.notification.update({
        where: { id: notificationId },
        data: { seen: true },
      });
      console.log(`👀 Notification ${notificationId} marked as seen.`);
    });

    // Handle user disconnection
    socket.on("disconnect", () => {
      console.log(`❌ User disconnected: ${socket.id}`);
      for (const [userId, socketId] of activeUsers.entries()) {
        if (socketId === socket.id) {
          activeUsers.delete(userId);
          console.log(`🚪 User ${userId} logged out.`);
          break;
        }
      }
    });
  });
};
