import { Controller, Get } from '@nestjs/common';

@Controller('users')
export class UsersController {
  @Get()
  getUsers() {
    return [
      { id: 1, name: 'Milica' },
      { id: 2, name: 'John' },
    ];
  }
}
