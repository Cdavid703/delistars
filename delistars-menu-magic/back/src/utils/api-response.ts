import { Response } from 'express';
import { IApiResponse } from '../interfaces/common.interface';

export class ApiResponse {
  static success<T>(
    res: Response,
    data: T,
    message: string = 'Success',
    statusCode: number = 200,
  ): Response {
    const response: IApiResponse<T> = {
      success: true,
      data,
      message,
      timestamp: new Date(),
    };
    return res.status(statusCode).json(response);
  }

  static error(
    res: Response,
    error: string,
    statusCode: number = 500,
    message?: string,
  ): Response {
    const response: IApiResponse<null> = {
      success: false,
      error,
      message: message || error,
      timestamp: new Date(),
    };
    return res.status(statusCode).json(response);
  }

  static created<T>(
    res: Response,
    data: T,
    message: string = 'Resource created successfully',
  ): Response {
    return this.success(res, data, message, 201);
  }

  static badRequest(res: Response, error: string): Response {
    return this.error(res, error, 400, 'Bad Request');
  }

  static unauthorized(res: Response, error: string = 'Unauthorized'): Response {
    return this.error(res, error, 401, 'Unauthorized');
  }

  static forbidden(res: Response, error: string = 'Forbidden'): Response {
    return this.error(res, error, 403, 'Forbidden');
  }

  static notFound(res: Response, error: string = 'Not Found'): Response {
    return this.error(res, error, 404, 'Not Found');
  }
}
