#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface ObjCExceptionCatcher : NSObject

+ (nullable NSException *)tryBlock:(__attribute__((noescape)) void (^)(void))block;

@end

NS_ASSUME_NONNULL_END
