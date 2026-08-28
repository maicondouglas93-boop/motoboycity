#import <CoreLocation/CoreLocation.h>
#import <React/RCTBridgeModule.h>

@interface LocationTrackingModule : NSObject <RCTBridgeModule, CLLocationManagerDelegate>
@property(nonatomic, strong) CLLocationManager *locationManager;
@property(nonatomic, copy) NSArray<NSString *> *deliveryIds;
@property(nonatomic, copy) NSString *baseUrl;
@property(nonatomic, copy) NSString *accessToken;
@property(nonatomic, copy) NSString *appVersion;
@property(nonatomic, strong) CLLocation *latestLocation;
@property(nonatomic, strong) NSTimer *presenceTimer;
@property(nonatomic, assign) BOOL presenceRecoveryInFlight;
@end

@implementation LocationTrackingModule

RCT_EXPORT_MODULE(LocationTracking)

+ (BOOL)requiresMainQueueSetup
{
  return YES;
}

RCT_REMAP_METHOD(start,
                 startWithDeliveryIds:(NSArray<NSString *> *)deliveryIds
                 baseUrl:(NSString *)baseUrl
                 accessToken:(NSString *)accessToken
                 appVersion:(NSString *)appVersion
                 resolve:(RCTPromiseResolveBlock)resolve
                 reject:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    NSMutableArray<NSString *> *validIds = [NSMutableArray array];
    for (id identifier in deliveryIds) {
      if ([identifier isKindOfClass:[NSString class]] && [(NSString *)identifier length] > 0) {
        [validIds addObject:identifier];
      }
    }
    if (![CLLocationManager locationServicesEnabled]) {
      reject(@"location_services_disabled", @"Ative os serviços de localização para iniciar o rastreamento.", nil);
      return;
    }

    self.deliveryIds = [validIds copy];
    self.baseUrl = baseUrl;
    self.accessToken = accessToken;
    self.appVersion = appVersion;
    [self ensureLocationManager];
    self.locationManager.distanceFilter = validIds.count > 0 ? 50.0 : 100.0;

    CLAuthorizationStatus authorization = self.locationManager.authorizationStatus;
    if (authorization == kCLAuthorizationStatusDenied || authorization == kCLAuthorizationStatusRestricted) {
      reject(@"location_permission_required", @"A localização em segundo plano precisa estar autorizada para esta entrega.", nil);
      return;
    }

    if (authorization == kCLAuthorizationStatusNotDetermined || authorization == kCLAuthorizationStatusAuthorizedWhenInUse) {
      [self.locationManager requestAlwaysAuthorization];
    }
    [self.locationManager startUpdatingLocation];
    [self startPresenceTimer];
    resolve(nil);
  });
}

RCT_REMAP_METHOD(stop,
                 stopWithResolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    [self stopTracking];
    resolve(nil);
  });
}

- (void)ensureLocationManager
{
  if (self.locationManager != nil) {
    return;
  }

  self.locationManager = [[CLLocationManager alloc] init];
  self.locationManager.delegate = self;
  self.locationManager.desiredAccuracy = kCLLocationAccuracyBest;
  self.locationManager.distanceFilter = 50.0;
  self.locationManager.pausesLocationUpdatesAutomatically = NO;
  self.locationManager.allowsBackgroundLocationUpdates = YES;
}

- (void)locationManagerDidChangeAuthorization:(CLLocationManager *)manager
{
  if (manager.authorizationStatus == kCLAuthorizationStatusDenied ||
      manager.authorizationStatus == kCLAuthorizationStatusRestricted) {
    [self stopTracking];
    return;
  }

  if (self.accessToken.length > 0 && manager.authorizationStatus != kCLAuthorizationStatusNotDetermined) {
    [manager startUpdatingLocation];
  }
}

- (void)locationManager:(CLLocationManager *)manager didUpdateLocations:(NSArray<CLLocation *> *)locations
{
  CLLocation *location = locations.lastObject;
  if (location == nil || self.baseUrl.length == 0 || self.accessToken.length == 0 || self.appVersion.length == 0) {
    return;
  }

  self.latestLocation = location;
  [self reportPresence:location];
  NSArray<NSString *> *trackedDeliveries = [self.deliveryIds copy];
  for (NSString *deliveryId in trackedDeliveries) {
    [self reportLocation:location forDelivery:deliveryId];
  }
}

- (void)reportPresence:(CLLocation *)location
{
  NSString *normalizedBaseUrl = self.baseUrl;
  while ([normalizedBaseUrl hasSuffix:@"/"]) {
    normalizedBaseUrl = [normalizedBaseUrl substringToIndex:normalizedBaseUrl.length - 1];
  }
  NSURL *url = [NSURL URLWithString:[NSString stringWithFormat:@"%@/driver/presence/heartbeat", normalizedBaseUrl]];
  if (url == nil) return;

  NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:url];
  request.HTTPMethod = @"POST";
  request.timeoutInterval = 15.0;
  [request setValue:[NSString stringWithFormat:@"Bearer %@", self.accessToken] forHTTPHeaderField:@"Authorization"];
  [request setValue:@"application/json" forHTTPHeaderField:@"Content-Type"];
  NSMutableDictionary *payload = [@{
    @"lat": @(location.coordinate.latitude),
    @"lng": @(location.coordinate.longitude),
    @"appVersion": self.appVersion,
  } mutableCopy];
  if (location.horizontalAccuracy >= 0) payload[@"accuracy"] = @(location.horizontalAccuracy);
  request.HTTPBody = [NSJSONSerialization dataWithJSONObject:payload options:0 error:nil];

  NSURLSessionDataTask *task = [[NSURLSession sharedSession] dataTaskWithRequest:request completionHandler:^(__unused NSData *data, NSURLResponse *response, __unused NSError *error) {
    NSInteger statusCode = [(NSHTTPURLResponse *)response statusCode];
    if (statusCode == 401) {
      dispatch_async(dispatch_get_main_queue(), ^{ [self stopTracking]; });
    } else if (statusCode == 403 || statusCode == 409) {
      [self restorePresence:location];
    }
  }];
  [task resume];
}

- (void)startPresenceTimer
{
  [self.presenceTimer invalidate];
  self.presenceTimer = [NSTimer timerWithTimeInterval:45.0
                                               target:self
                                             selector:@selector(sendScheduledPresence:)
                                             userInfo:nil
                                              repeats:YES];
  [[NSRunLoop mainRunLoop] addTimer:self.presenceTimer forMode:NSRunLoopCommonModes];
}

- (void)sendScheduledPresence:(__unused NSTimer *)timer
{
  CLLocation *location = self.latestLocation;
  if (location != nil && self.accessToken.length > 0) {
    [self reportPresence:location];
  }
}

- (void)restorePresence:(CLLocation *)location
{
  @synchronized(self) {
    if (self.presenceRecoveryInFlight) return;
    self.presenceRecoveryInFlight = YES;
  }

  NSString *normalizedBaseUrl = [self.baseUrl copy];
  NSString *accessToken = [self.accessToken copy];
  NSString *appVersion = [self.appVersion copy];
  if (normalizedBaseUrl.length == 0 || accessToken.length == 0 || appVersion.length == 0) {
    self.presenceRecoveryInFlight = NO;
    return;
  }
  while ([normalizedBaseUrl hasSuffix:@"/"]) {
    normalizedBaseUrl = [normalizedBaseUrl substringToIndex:normalizedBaseUrl.length - 1];
  }
  NSURL *url = [NSURL URLWithString:[NSString stringWithFormat:@"%@/driver/presence", normalizedBaseUrl]];
  if (url == nil) {
    self.presenceRecoveryInFlight = NO;
    return;
  }

  NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:url];
  request.HTTPMethod = @"PUT";
  request.timeoutInterval = 15.0;
  [request setValue:[NSString stringWithFormat:@"Bearer %@", accessToken] forHTTPHeaderField:@"Authorization"];
  [request setValue:@"application/json" forHTTPHeaderField:@"Content-Type"];
  NSMutableDictionary *locationPayload = [@{
    @"lat": @(location.coordinate.latitude),
    @"lng": @(location.coordinate.longitude),
  } mutableCopy];
  if (location.horizontalAccuracy >= 0) locationPayload[@"accuracy"] = @(location.horizontalAccuracy);
  NSDictionary *payload = @{
    @"availability": @"AVAILABLE",
    @"location": locationPayload,
    @"appVersion": appVersion,
    @"trackingCapability": @"BACKGROUND_V1",
  };
  request.HTTPBody = [NSJSONSerialization dataWithJSONObject:payload options:0 error:nil];

  NSURLSessionDataTask *task = [[NSURLSession sharedSession] dataTaskWithRequest:request completionHandler:^(__unused NSData *data, NSURLResponse *response, __unused NSError *error) {
    NSInteger statusCode = [(NSHTTPURLResponse *)response statusCode];
    @synchronized(self) {
      self.presenceRecoveryInFlight = NO;
    }
    if (statusCode == 401 || statusCode == 403) {
      dispatch_async(dispatch_get_main_queue(), ^{ [self stopTracking]; });
    }
  }];
  [task resume];
}

- (void)reportLocation:(CLLocation *)location forDelivery:(NSString *)deliveryId
{
  NSString *escapedId = [deliveryId stringByAddingPercentEncodingWithAllowedCharacters:[NSCharacterSet URLPathAllowedCharacterSet]];
  NSString *normalizedBaseUrl = self.baseUrl;
  while ([normalizedBaseUrl hasSuffix:@"/"]) {
    normalizedBaseUrl = [normalizedBaseUrl substringToIndex:normalizedBaseUrl.length - 1];
  }
  NSString *urlString = [NSString stringWithFormat:@"%@/tracking/driver/deliveries/%@/points", normalizedBaseUrl, escapedId];
  NSURL *url = [NSURL URLWithString:urlString];
  if (url == nil) {
    return;
  }

  NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:url];
  request.HTTPMethod = @"POST";
  request.timeoutInterval = 15.0;
  [request setValue:[NSString stringWithFormat:@"Bearer %@", self.accessToken] forHTTPHeaderField:@"Authorization"];
  [request setValue:@"application/json" forHTTPHeaderField:@"Content-Type"];

  NSMutableDictionary *payload = [@{
    @"lat": @(location.coordinate.latitude),
    @"lng": @(location.coordinate.longitude),
  } mutableCopy];
  if (location.horizontalAccuracy >= 0) {
    payload[@"accuracy"] = @(location.horizontalAccuracy);
  }
  NSError *serializationError;
  request.HTTPBody = [NSJSONSerialization dataWithJSONObject:payload options:0 error:&serializationError];
  if (serializationError != nil) {
    return;
  }

  NSURLSessionDataTask *task = [[NSURLSession sharedSession] dataTaskWithRequest:request completionHandler:^(__unused NSData *data, NSURLResponse *response, __unused NSError *error) {
    NSInteger statusCode = [(NSHTTPURLResponse *)response statusCode];
    if (statusCode == 401 || statusCode == 403 || statusCode == 404 || statusCode == 409) {
      dispatch_async(dispatch_get_main_queue(), ^{
        NSMutableArray<NSString *> *remaining = [self.deliveryIds mutableCopy];
        [remaining removeObject:deliveryId];
        self.deliveryIds = remaining;
      });
    }
  }];
  [task resume];
}

- (void)stopTracking
{
  [self.locationManager stopUpdatingLocation];
  [self.presenceTimer invalidate];
  self.presenceTimer = nil;
  self.latestLocation = nil;
  self.presenceRecoveryInFlight = NO;
  self.deliveryIds = @[];
  self.baseUrl = nil;
  self.accessToken = nil;
  self.appVersion = nil;
}

@end
