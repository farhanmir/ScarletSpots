#import "ObjCExceptionCatcher.h"

@implementation ObjCExceptionCatcher

+ (NSException *)catchFrom:(__attribute__((noescape)) void (^)(void))block {
  @try {
    if (block) {
      block();
    }
    return nil;
  } @catch (NSException *exception) {
    NSLog(@"[ParkingMagic] Caught Obj-C exception: name=%@ reason=%@ userInfo=%@",
          exception.name, exception.reason, exception.userInfo);
    return exception;
  }
}

@end
