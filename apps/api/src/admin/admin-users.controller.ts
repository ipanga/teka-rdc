import { Controller, Get, Patch, Param, Body, Query, ParseUUIDPipe } from '@nestjs/common';
import { AdminUsersService } from './admin-users.service';
import { SearchUsersDto } from './dto/search-users.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('v1/admin/users')
@Roles('ADMIN', 'SUPPORT')
export class AdminUsersController {
  constructor(private adminUsersService: AdminUsersService) {}

  @Get()
  async findAll(@Query() query: SearchUsersDto) {
    return this.adminUsersService.findAllUsers(query);
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminUsersService.findUserById(id);
  }

  @Patch(':id/status')
  @Roles('ADMIN')
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserStatusDto,
  ) {
    return this.adminUsersService.updateUserStatus(id, dto);
  }
}
