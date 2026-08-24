---
name: motoboycity-driver-mobile
description: Implement, diagnose, or review the MOTOboyCity React Native driver app, including login/session, presence, Socket.IO delivery offers, navigation, Android/iOS native configuration, API environment URLs, and future GPS or notification prerequisites. Use for work under apps/driver-app.
---

1. Trace screen -> store -> API/socket client -> backend event or route before changing a driver flow.
2. Distinguish current real flows (auth, presence, offer accept/decline) from screens backed by `mockData`.
3. Keep the Socket.IO lifecycle single and intentional. Test reconnect, expired/cancelled offer, app navigation, and multiple event delivery before changing offer handling.
4. Keep token access asynchronous through `session`; clear it on invalid session paths.
5. Treat API URL, cleartext traffic, Android permissions, iOS entitlements, background location, and FCM as environment/native concerns. Do not add a native dependency or permission without an explicit product and privacy requirement.
6. Avoid editing generated Android/iOS files unless the request requires native behavior and the resulting Android/iOS impact is understood.
7. Validate with TypeScript, Jest, lint, and Android/iOS build or device testing appropriate to the changed layer.

Do not use this skill to invent GPS, push, wallet, history, or payment endpoints that do not exist in the API.
