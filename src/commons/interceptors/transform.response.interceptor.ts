import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  StreamableFile,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Response<T> {
  statusCode: number;
  message: string;
  data: T;
}

@Injectable()
export class TransformResponseInterceptor<T>
  implements NestInterceptor<T, Response<T> | StreamableFile>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<Response<any> | StreamableFile> {
    return next.handle().pipe(
      map((data) => {
        if (data instanceof StreamableFile) {
          return data;
        }

        const response = context.switchToHttp().getResponse();

        // Response có dạng { message, result }
        if (
          data &&
          typeof data === 'object' &&
          !Array.isArray(data) &&
          'result' in data
        ) {
          return {
            statusCode: response.statusCode,
            message: data.message ?? 'Success',
            data: data.result,
          };
        }

        // Response dữ liệu trực tiếp
        return {
          statusCode: response.statusCode,
          message: 'Success',
          data,
        };
      }),
    );
  }
}