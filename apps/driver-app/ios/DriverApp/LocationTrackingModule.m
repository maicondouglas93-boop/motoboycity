#import <CoreLocation/CoreLocation.h>
#import <React/RCTBridgeModule.h>

@interface LocationTrackingModule : NSObject <RCTBridgeModule, CLLocationManagerDelegate>
@property(nonatomic, strong) CLLocationManager *locationManager;
@property(nonatomic, copy) NSArray<NSString *> *deliveryIds;
@property(nonatomic, copy) NSString *baseUrl;
@property(nonatomic, copy) NSString *accessToken;
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
    if (validIds.count == 0) {
      [self stopTracking];
      resolve(nil);
      return;
    }

    if (![CLLocationManager locationServicesEnabled]) {
      reject(@"location_services_disabled", @"Ative os serviços de localização para iniciar o rastreamento.", nil);
      return;
    }

    self.deliveryIds = [validIds copy];
    self.baseUrl = baseUrl;
    self.accessToken = accessToken;
    [self ensureLocationManager];

    CLAuthorizationStatus authorization = self.locationManager.authorizationStatus;
    if (authorization == kCLAuthorizationStatusDenied || authorization == kCLAuthorizationStatusRestricted) {
      reject(@"location_permission_required", @"A localização em segundo plano precisa estar autorizada para esta entrega.", nil);
      return;
    }

    if (authorization == kCLAuthorizationStatusNotDetermined || authorization == kCLAuthorizationStatusAuthorizedWhenInUse) {
      [self.locationManager requestAlwaysAuthorization];
    }
    [self.locationManager startUpdatingLocation];
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

  if (self.deliveryIds.count > 0 && manager.authorizationStatus != kCLAuthorizationStatusNotDetermined) {
    [manager startUpdatingLocation];
  }
}

- (void)locationManager:(CLLocationManager *)manager didUpdateLocations:(NSArray<CLLocation *> *)locations
{
  CLLocation *location = locations.lastObject;
  if (location == nil || self.deliveryIds.count == 0 || self.baseUrl.length == 0 || self.accessToken.length == 0) {
    return;
  }

  NSArray<NSString *> *trackedDeliveries = [self.deliveryIds copy];
  for (NSString *deliveryId in trackedDeliveries) {
    [self reportLocation:location forDelivery:deliveryId];
  }
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
        if (self.deliveryIds.count == 0) {
          [self stopTracking];
        }
      });
    }
  }];
  [task resume];
}

- (void)stopTracking
{
  [self.locationManager stopUpdatingLocation];
  self.deliveryIds = @[];
  self.baseUrl = nil;
  self.accessToken = nil;
}

@end
