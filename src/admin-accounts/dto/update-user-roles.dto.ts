import { ArrayUnique, IsArray, IsIn } from 'class-validator';

export class UpdateUserRolesDto {
  @IsArray()
  @ArrayUnique()
  @IsIn(['RENTER', 'SHOP_OWNER'], { each: true })
  roles!: Array<'RENTER' | 'SHOP_OWNER'>;
}
