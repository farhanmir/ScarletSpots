#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface ObjCExceptionCatcher : NSObject

+ (nullable NSException *)catchFrom:(__attribute__((noescape)) void (^)(void))block
    NS_SWIFT_NAME(catch(from:));

@end

NS_ASSUME_NONNULL_END
